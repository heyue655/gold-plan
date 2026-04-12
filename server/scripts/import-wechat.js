/**
 * 微信支付账单导入脚本
 * 用法: node scripts/import-wechat.js <excel文件路径> <用户ID>
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── 分类映射规则 ──
// 关键词 → 系统分类（按优先级，先匹配先命中）
const EXPENSE_RULES = [
  // 餐饮
  { keywords: ['肯德基', '麦当劳', '海底捞', '面馆', '餐饮', '餐厅', '面馆', '饭菜', '下饭', '湘菜', '大排档', '烧烤', '肉夹', '酸辣粉', '鱼丸', '木桶饭', '麻辣香锅', '臭豆腐', '煎饼', '小吃'], category: '正餐' },
  { keywords: ['美团', '团购', '大众点评', '外卖'], category: '外卖' },
  { keywords: ['零食', '饮料', '奶茶', '咖啡', '水果', '果品', '土货铺'], category: '零食饮料' },
  { keywords: ['聚餐', '宴'], category: '聚餐' },
  // 交通
  { keywords: ['ETC', '高速', '通行费'], category: '加油停车' },
  { keywords: ['停车', '车场', '泊位', '道路停车'], category: '加油停车' },
  { keywords: ['充电', '充换电', '新能源', '星星充电', 'e充电', '特来电'], category: '加油停车' },
  { keywords: ['公交', '地铁', '公共交通'], category: '公共交通' },
  { keywords: ['滴滴', '打车', '出租'], category: '打车' },
  // 购物
  { keywords: ['日用', '超市', '便利店', '舀米', '轻巧拿'], category: '日用品' },
  { keywords: ['服饰', '美妆', '衣服', '鞋'], category: '服饰美妆' },
  { keywords: ['华为', '数码', '电子', '手机'], category: '数码电子' },
  { keywords: ['渔具', '宠物'], category: '其他购物' },
  // 娱乐
  { keywords: ['王者荣耀', '游戏', '点券', '天游'], category: '游戏' },
  { keywords: ['KTV', '点歌', '雷石', 'K歌', '无麦'], category: '影视音乐' },
  { keywords: ['儿童车', '共享'], category: '其他' },
  // 生活
  { keywords: ['住房', '物业', '房租', '水电'], category: '住房' },
  { keywords: ['医疗', '药', '医院', '妇保'], category: '医疗' },
  { keywords: ['话费', '手机充值', '通讯'], category: '通讯' },
  { keywords: ['快递', '顺丰', '速运'], category: '其他购物' },
  { keywords: ['酒店', '住宿', '简逸生活', '旅游'], category: '旅游' },
  { keywords: ['认证', '培训', '技能'], category: '其他' },
  { keywords: ['图文', '标王'], category: '其他' },
]

const INCOME_RULES = [
  { keywords: ['工资', '薪资', '薪酬', '奖金'], category: '工资' },
  { keywords: ['兼职'], category: '兼职' },
  { keywords: ['红包'], category: '红包' },
  { keywords: ['理财', '利息', '分红'], category: '理财' },
  { keywords: ['转账'], category: '其他' },
]

function matchCategory(merchant, product, direction) {
  const text = `${merchant}|${product}`.toLowerCase()
  const rules = direction === '收入' ? INCOME_RULES : EXPENSE_RULES

  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase())) {
        return rule.category
      }
    }
  }
  return '其他'
}

// 微信账单中的日期可能是 Excel 序列号，需要转换
function parseDate(raw) {
  if (typeof raw === 'number') {
    // Excel serial number → JS Date (Excel epoch: 1900-01-01, with off-by-one)
    const d = new Date((raw - 25569) * 86400000)
    return d
  }
  if (typeof raw === 'string') {
    return new Date(raw.replace(/\//g, '-'))
  }
  return new Date(raw)
}

// 判断是否应该跳过的交易
function shouldSkip(row) {
  const direction = row[4]
  const status = row[7] || ''
  const txType = row[1] || ''

  // 只处理 支出/收入，跳过中性交易（'/'）
  if (direction !== '支出' && direction !== '收入') return true

  // 跳过已全额退款
  if (status === '已全额退款') return true

  // 跳过信用卡还款、充值提现等中性交易
  if (txType === '信用卡还款' || txType === '零钱充值') return true

  // 跳过退款类型（它们是收入方向但不是真正收入）
  if (txType.includes('退款')) return true

  return false
}

// 处理"亲属卡交易"和"转账"为支出
function mapType(direction) {
  return direction === '收入' ? 'INCOME' : 'EXPENSE'
}

async function main() {
  const filePath = process.argv[2]
  const userId = parseInt(process.argv[3])

  if (!filePath || !userId) {
    console.error('用法: node scripts/import-wechat.js <excel文件> <用户ID>')
    process.exit(1)
  }

  // 验证用户存在
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    console.error(`用户 ID ${userId} 不存在`)
    process.exit(1)
  }

  console.log(`导入目标用户: ${user.username} (ID: ${userId})`)

  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // 找到数据起始行（列标题行之后）
  let headerRow = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i] && data[i][0] === '交易时间') {
      headerRow = i
      break
    }
  }
  if (headerRow === -1) {
    console.error('未找到列标题行')
    process.exit(1)
  }

  const records = []
  const skipped = []
  const categoryStats = {}

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[0]) continue

    if (shouldSkip(row)) {
      skipped.push({ reason: `${row[1]}|${row[4]}|${row[7]}`, merchant: row[2], amount: row[5] })
      continue
    }

    const date = parseDate(row[0])
    const merchant = (row[2] || '').toString().trim()
    const product = (row[3] || '').toString().trim()
    const direction = row[4]
    const amount = typeof row[5] === 'number' ? row[5] : parseFloat(String(row[5]).replace(/[¥,]/g, ''))
    const payMethod = (row[6] || '').toString().trim()

    if (isNaN(amount) || amount <= 0) continue

    const type = mapType(direction)
    const category = matchCategory(merchant, product, direction)

    // 构建 note：商户 + 商品简述
    let note = merchant
    if (product && product !== '/' && !product.startsWith('收款方备注')) {
      const shortProduct = product.length > 50 ? product.substring(0, 50) + '…' : product
      note = `${merchant} - ${shortProduct}`
    }
    // 标记亲属卡
    if (row[1] === '亲属卡交易') {
      note = `[亲属卡] ${note}`
    }
    // 截断到200字符
    if (note.length > 200) note = note.substring(0, 197) + '…'

    records.push({
      userId,
      type,
      amount,
      category,
      note,
      date,
    })

    const key = `${type}|${category}`
    categoryStats[key] = (categoryStats[key] || 0) + 1
  }

  console.log(`\n── 分类统计 ──`)
  Object.entries(categoryStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, count]) => console.log(`  ${key}: ${count} 笔`))

  console.log(`\n总计: ${records.length} 笔待导入, ${skipped.length} 笔跳过`)
  console.log(`跳过原因:`)
  const skipReasons = {}
  skipped.forEach((s) => {
    skipReasons[s.reason] = (skipReasons[s.reason] || 0) + 1
  })
  Object.entries(skipReasons).forEach(([r, c]) => console.log(`  ${r}: ${c} 笔`))

  // 批量写入
  console.log(`\n开始写入数据库…`)
  let created = 0
  const batchSize = 50
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const result = await prisma.ledgerEntry.createMany({
      data: batch.map((r) => ({
        userId: r.userId,
        type: r.type,
        amount: r.amount,
        category: r.category,
        note: r.note,
        date: r.date,
      })),
    })
    created += result.count
    process.stdout.write(`\r  已写入 ${created}/${records.length}`)
  }
  console.log(`\n✅ 导入完成! 共写入 ${created} 笔记录`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('导入失败:', err)
  prisma.$disconnect()
  process.exit(1)
})
