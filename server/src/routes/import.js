const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── 共用分类映射规则 ──
const EXPENSE_RULES = [
  { keywords: ['肯德基', '麦当劳', '海底捞', '面馆', '餐饮', '餐厅', '饭菜', '下饭', '湘菜', '大排档', '烧烤', '肉夹', '酸辣粉', '鱼丸', '木桶饭', '麻辣香锅', '臭豆腐', '煎饼', '小吃', '菜场', '包笼', '冷冻食品'], category: '正餐' },
  { keywords: ['美团', '团购', '大众点评', '外卖'], category: '外卖' },
  { keywords: ['零食', '饮料', '奶茶', '咖啡', '水果', '果品', '土货铺'], category: '零食饮料' },
  { keywords: ['聚餐', '宴'], category: '聚餐' },
  { keywords: ['ETC', '高速', '通行费'], category: '加油停车' },
  { keywords: ['停车', '车场', '泊位', '道路停车', '通道支付'], category: '加油停车' },
  { keywords: ['充电', '充换电', '新能源', '星星充电', 'e充电', '特来电'], category: '加油停车' },
  { keywords: ['加油', '石化', '石油', '中油'], category: '加油停车' },
  { keywords: ['公交', '地铁', '公共交通'], category: '公共交通' },
  { keywords: ['滴滴', '打车', '出租'], category: '打车' },
  { keywords: ['日用', '超市', '便利店', '舀米', '智盘充值', '安恒后勤', '轻巧拿'], category: '日用品' },
  { keywords: ['服饰', '美妆', '衣服', '鞋'], category: '服饰美妆' },
  { keywords: ['华为', '数码', '电子', '手机', '阿里云', 'Stripe', '智谱', '剪映'], category: '数码电子' },
  { keywords: ['渔具', '宠物', '狗粮', '猫粮', '宠物医院'], category: '宠物' },
  { keywords: ['王者荣耀', '游戏', '点券', '天游', '王者归来'], category: '游戏' },
  { keywords: ['KTV', '点歌', '雷石', 'K歌', '无麦'], category: '影视音乐' },
  { keywords: ['住房', '物业', '房租'], category: '住房' },
  { keywords: ['电费', '供电', '水费', '水务', '燃气', '中燃', '国网'], category: '水电燃气' },
  { keywords: ['医疗', '药', '医院', '妇保', '胚胎'], category: '医疗' },
  { keywords: ['话费', '手机充值', '联通', '电信'], category: '通讯' },
  { keywords: ['快递', '顺丰', '速运', '邮政速递'], category: '其他购物' },
  { keywords: ['酒店', '住宿', '简逸生活', '旅游', '游船', '湿地'], category: '旅游' },
  { keywords: ['亲属卡'], category: '亲属卡' },
  { keywords: ['转账'], category: '转账' },
  { keywords: ['发给'], category: '红包' },
  { keywords: ['儿童车', '共享'], category: '其他' },
  { keywords: ['认证', '培训', '技能', '学杂费', '学费', '培训学校'], category: '学费培训' },
  { keywords: ['图文', '标王'], category: '其他' },
];

const INCOME_RULES = [
  { keywords: ['工资', '薪资', '薪酬', '奖金'], category: '工资' },
  { keywords: ['兼职'], category: '兼职' },
  { keywords: ['红包'], category: '红包' },
  { keywords: ['理财', '利息', '分红'], category: '理财' },
  { keywords: ['转账'], category: '转账' },
];

function matchCategory(text, direction) {
  const lower = text.toLowerCase();
  const rules = direction === '收入' ? INCOME_RULES : EXPENSE_RULES;
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) return rule.category;
    }
  }
  return '其他';
}

// Excel 序列号 → JS Date
function excelDateToJS(raw) {
  if (typeof raw === 'number') return new Date((raw - 25569) * 86400000);
  if (typeof raw === 'string') return new Date(raw.replace(/\//g, '-'));
  return new Date(raw);
}

function buildNote(merchant, product, txType) {
  let note = merchant;
  if (product && product !== '/' && !product.startsWith('收款方备注')) {
    const short = product.length > 50 ? product.substring(0, 50) + '…' : product;
    note = `${merchant} - ${short}`;
  }
  if (txType === '亲属卡交易') note = `[亲属卡] ${note}`;
  return note.length > 200 ? note.substring(0, 197) + '…' : note;
}

// ── 微信账单解析 ──
function parseWechat(data) {
  // 找列标题行
  let headerIdx = -1;
  for (let i = 0; i < Math.min(30, data.length); i++) {
    if (data[i] && data[i][0] === '交易时间') { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error('未找到微信账单的列标题行（交易时间）');

  const records = [];
  const skipped = [];

  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i];
    if (!r || !r[0]) continue;

    const direction = r[4];
    const status = (r[7] || '').toString();
    const txType = (r[1] || '').toString();

    // 跳过：中性交易、全额退款、信用卡还款、零钱充值、退款类
    if (direction !== '支出' && direction !== '收入') { skipped.push(txType); continue; }
    if (status === '已全额退款') { skipped.push('全额退款'); continue; }
    if (txType === '信用卡还款' || txType === '零钱充值') { skipped.push(txType); continue; }
    if (txType.includes('退款')) { skipped.push(txType); continue; }

    const merchant = (r[2] || '').toString().trim();
    const product = (r[3] || '').toString().trim();
    const amount = typeof r[5] === 'number' ? r[5] : parseFloat(String(r[5]).replace(/[¥,]/g, ''));
    if (isNaN(amount) || amount <= 0) continue;

    const text = `${merchant}|${product}`;
    records.push({
      type: direction === '收入' ? 'INCOME' : 'EXPENSE',
      amount,
      category: matchCategory(text, direction),
      note: buildNote(merchant, product, txType),
      date: excelDateToJS(r[0]),
    });
  }
  return { records, skipped };
}

// ── 支付宝交易分类 → 系统分类 映射 ──
const ALIPAY_CATEGORY_MAP = {
  '餐饮美食': '正餐',
  '交通出行': '公共交通',
  '爱车养车': '加油停车',
  '日用百货': '日用品',
  '文化休闲': '游戏',
  '充值缴费': '水电燃气',
  '医疗健康': '医疗',
  '酒店旅游': '旅游',
  '转账红包': '转账',
  '生活服务': '其他',
  '公共服务': '其他',
  '商业服务': '其他',
  '美容美发': '服饰美妆',
  '宠物': '宠物',
  '教育培训': '学费培训',
  '投资理财': '其他',
};

// 支付宝：先用其自身的分类，再用关键词细化
function alipayCategory(aliCat, text, direction) {
  if (direction === '收入') return matchCategory(text, direction);
  // 关键词优先细化
  const kw = matchCategory(text, direction);
  if (kw !== '其他') return kw;
  // 使用支付宝自带分类映射
  return ALIPAY_CATEGORY_MAP[aliCat] || '其他';
}

// 简单 CSV 行解析（处理逗号在字段内的情况不多，支付宝账单基本不会有）
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
}

// ── 支付宝账单解析 ──
function parseAlipay(buffer) {
  // 支付宝 CSV 是 GBK 编码
  let text;
  // 尝试 GBK 解码，如果前几个字符是 --- 或中文则确认为 GBK
  const gbkText = iconv.decode(buffer, 'gbk');
  const utf8Text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
  // 如果 GBK 解码后含有"支付宝"则是 GBK
  text = gbkText.includes('支付宝') ? gbkText : utf8Text;

  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));

  // 找列标题行
  let headerIdx = -1;
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    if (lines[i].startsWith('交易时间,')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error('未找到支付宝账单的列标题行（交易时间），请确认文件格式');

  const headers = parseCSVLine(lines[headerIdx]);
  const col = (name) => headers.indexOf(name);
  const colAlt = (...names) => { for (const n of names) { const i = col(n); if (i !== -1) return i; } return -1; };

  const iTime = col('交易时间');
  const iCategory = colAlt('交易分类');
  const iCounterparty = colAlt('交易对方');
  const iProduct = colAlt('商品说明', '商品名称');
  const iDirection = colAlt('收/支');
  const iAmount = colAlt('金额', '金额（元）');
  const iStatus = colAlt('交易状态', '资金状态');

  if (iTime === -1 || iAmount === -1) {
    throw new Error('支付宝账单列不完整，需要至少包含"交易时间"和"金额"列');
  }

  const records = [];
  const skipped = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('-')) continue;

    const r = parseCSVLine(line);
    if (r.length < 6 || !r[iTime]) continue;

    const direction = iDirection !== -1 ? r[iDirection] : '';
    const status = iStatus !== -1 ? r[iStatus] : '';
    const aliCat = iCategory !== -1 ? r[iCategory] : '';

    // 跳过：不计收支、退款类、交易关闭
    if (direction !== '支出' && direction !== '收入') { skipped.push(direction || '不计收支'); continue; }
    if (status.includes('退款') || status === '交易关闭') { skipped.push(status); continue; }
    if (aliCat === '退款') { skipped.push('退款分类'); continue; }

    const counterparty = iCounterparty !== -1 ? r[iCounterparty] : '';
    const product = iProduct !== -1 ? r[iProduct] : '';
    const rawAmt = r[iAmount];
    const amount = parseFloat(String(rawAmt).replace(/[¥,\s]/g, ''));
    if (isNaN(amount) || amount <= 0) continue;

    const text = `${counterparty}|${product}`;
    let note = counterparty;
    if (product && product !== '/') {
      const short = product.length > 50 ? product.substring(0, 50) + '…' : product;
      note = `${counterparty} - ${short}`;
    }
    if (note.length > 200) note = note.substring(0, 197) + '…';

    records.push({
      type: direction === '收入' ? 'INCOME' : 'EXPENSE',
      amount,
      category: alipayCategory(aliCat, text, direction),
      note,
      date: new Date(r[iTime].trim()),
    });
  }
  return { records, skipped };
}

// ── POST /api/import/:source  (source = wechat | alipay) ──
router.post('/:source', auth, upload.single('file'), async (req, res) => {
  const { source } = req.params;
  if (!['wechat', 'alipay'].includes(source)) {
    return res.status(400).json({ message: '不支持的账单类型' });
  }
  if (!req.file) {
    return res.status(400).json({ message: '请上传文件' });
  }

  try {
    let records, skipped;

    if (source === 'wechat') {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      ({ records, skipped } = parseWechat(data));
    } else {
      // 支付宝：CSV 文件，GBK 编码，直接传 buffer
      ({ records, skipped } = parseAlipay(req.file.buffer));
    }

    if (records.length === 0) {
      return res.status(400).json({ message: '未解析到有效记录，请检查文件格式' });
    }

    // ── 去重：查询该用户已有记录，按 (date, amount, note) 匹配 ──
    const minDate = new Date(Math.min(...records.map(r => r.date.getTime())));
    const maxDate = new Date(Math.max(...records.map(r => r.date.getTime())));
    // 扩展一天范围以覆盖时区偏差
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 1);

    const existing = await prisma.ledgerEntry.findMany({
      where: {
        userId: req.user.id,
        date: { gte: minDate, lte: maxDate },
      },
      select: { date: true, amount: true, note: true, type: true },
    });

    // 构建已有记录指纹集合
    const existingSet = new Set(
      existing.map(e => {
        const d = e.date instanceof Date ? e.date.toISOString().split('T')[0] : String(e.date).split('T')[0];
        return `${d}|${parseFloat(e.amount)}|${e.type}|${(e.note || '').substring(0, 50)}`;
      })
    );

    const uniqueRecords = [];
    let duplicateCount = 0;
    for (const r of records) {
      const d = r.date.toISOString().split('T')[0];
      const fingerprint = `${d}|${r.amount}|${r.type}|${(r.note || '').substring(0, 50)}`;
      if (existingSet.has(fingerprint)) {
        duplicateCount++;
      } else {
        uniqueRecords.push(r);
        existingSet.add(fingerprint); // 防止同文件内重复
      }
    }

    let importedCount = 0;
    if (uniqueRecords.length > 0) {
      const result = await prisma.ledgerEntry.createMany({
        data: uniqueRecords.map((r) => ({
          userId: req.user.id,
          type: r.type,
          amount: r.amount,
          category: r.category,
          note: r.note,
          date: r.date,
        })),
      });
      importedCount = result.count;
    }

    // 统计分类
    const stats = {};
    uniqueRecords.forEach((r) => {
      const key = `${r.type}|${r.category}`;
      stats[key] = (stats[key] || 0) + 1;
    });

    return res.json({
      imported: importedCount,
      skipped: skipped.length,
      duplicates: duplicateCount,
      stats,
    });
  } catch (err) {
    console.error('账单导入失败:', err);
    if (err.message.includes('未找到') || err.message.includes('列不完整')) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: '导入失败，请检查文件格式' });
  }
});

module.exports = router;
