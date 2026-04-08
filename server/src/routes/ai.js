const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');
const { getFamilyUserIds } = require('./family');

const router = express.Router();

const toNum = (v) => parseFloat((v || 0).toString());

function buildMonths(year, month, count = 12) {
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    let y = year, m = month - i;
    while (m <= 0) { m += 12; y--; }
    months.push({ year: y, month: m });
  }
  return months;
}

async function aggregateUser(userId, months, startDate, endDate) {
  const [ledgerEntries, repayments] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { userId, date: { gte: startDate, lt: endDate } },
      select: { type: true, amount: true, category: true, date: true },
    }),
    prisma.monthlyRepayment.findMany({
      where: { userId, OR: months.map((m) => ({ year: m.year, month: m.month })) },
      select: { year: true, month: true, amount: true, isPaid: true },
    }),
  ]);

  const trendMap = {};
  months.forEach((m) => {
    trendMap[`${m.year}-${m.month}`] = { income: 0, expense: 0, repayment: 0 };
  });
  ledgerEntries.forEach((e) => {
    const d = new Date(e.date);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    if (!trendMap[key]) return;
    const amt = toNum(e.amount);
    if (e.type === 'INCOME') trendMap[key].income += amt;
    else trendMap[key].expense += amt;
  });
  repayments.forEach((r) => {
    const key = `${r.year}-${r.month}`;
    if (trendMap[key]) trendMap[key].repayment += toNum(r.amount);
  });

  const monthly = months.map((m) => {
    const d = trendMap[`${m.year}-${m.month}`];
    return {
      label: `${m.year}年${m.month}月`,
      income: +d.income.toFixed(2),
      expense: +d.expense.toFixed(2),
      repayment: +d.repayment.toFixed(2),
      balance: +(d.income - d.expense - d.repayment).toFixed(2),
    };
  });

  const expenseCatMap = {};
  const incomeCatMap = {};
  ledgerEntries.forEach((e) => {
    const amt = toNum(e.amount);
    if (e.type === 'EXPENSE') expenseCatMap[e.category] = (expenseCatMap[e.category] || 0) + amt;
    else incomeCatMap[e.category] = (incomeCatMap[e.category] || 0) + amt;
  });

  const totalIncome = Object.values(incomeCatMap).reduce((a, b) => a + b, 0);
  const totalExpense = Object.values(expenseCatMap).reduce((a, b) => a + b, 0);
  const totalRepayment = repayments.reduce((sum, r) => sum + toNum(r.amount), 0);
  const netBalance = +(totalIncome - totalExpense - totalRepayment).toFixed(2);

  return { monthly, incomeCatMap, expenseCatMap, totalIncome, totalExpense, totalRepayment, netBalance };
}

function formatCatMap(catMap) {
  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '  - 暂无数据';
  return entries.map(([k, v]) => `  - ${k}：¥${v.toFixed(2)}`).join('\n');
}

// 后台分析任务（非阻塞，POST /analyze 调用后立即返回 202）
async function runAnalysisJob(userId, apiKey, baseUrl, model) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const months = buildMonths(year, month, 12);
    const startDate = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
    const endDate   = new Date(Date.UTC(year, month, 1));

    const familyIds = await getFamilyUserIds(userId);
    const hasFamily = familyIds.length > 1;

    // 家庭 key：成员 id 升序拼接，个人为 "u{userId}"
    const familyKey = familyIds.length > 1
      ? familyIds.slice().sort((a, b) => a - b).map((id) => `u${id}`).join('_')
      : `u${userId}`;

    const [memberInfos, allGoals] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: familyIds } },
        select: { id: true, username: true },
      }),
      prisma.savingsGoal.findMany({
        where: { userId: { in: familyIds } },
      }),
    ]);

    const usernameMap = Object.fromEntries(memberInfos.map((u) => [u.id, u.username]));
    const personalGoal = allGoals.find((g) => g.userId === userId && g.scope === 'PERSONAL');
    const familyGoal = allGoals
      .filter((g) => g.scope === 'FAMILY')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;

    const memberDataList = await Promise.all(
      familyIds.map(async (uid) => ({
        userId: uid,
        username: usernameMap[uid] || `用户${uid}`,
        isSelf: uid === userId,
        data: await aggregateUser(uid, months, startDate, endDate),
      }))
    );

    const familyTotal = memberDataList.reduce(
      (acc, m) => {
        acc.totalIncome    += m.data.totalIncome;
        acc.totalExpense   += m.data.totalExpense;
        acc.totalRepayment += m.data.totalRepayment;
        acc.netBalance     += m.data.netBalance;
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, totalRepayment: 0, netBalance: 0 }
    );

    // 构建 Prompt
    const sections = [];
    sections.push('你是一个专业的家庭财务分析师。以下是用户及其关联账号近12个月的收支数据，请用中文进行全面分析并给出具体建议。');

    for (const m of memberDataList) {
      const tag = m.isSelf ? `${m.username}（本人）` : m.username;
      const d = m.data;
      const monthlyLines = d.monthly
        .map((row) => `  ${row.label}：收入 ¥${row.income}，支出 ¥${row.expense}，还款 ¥${row.repayment}，结余 ¥${row.balance}`)
        .join('\n');
      const memberGoal = allGoals.find((g) => g.userId === m.userId && g.scope === 'PERSONAL');
      const goalLine = memberGoal
        ? `  - 个人留金目标：¥${parseFloat(memberGoal.amount.toString()).toFixed(2)}，当前完成度：${Math.min((d.netBalance / parseFloat(memberGoal.amount.toString())) * 100, 100).toFixed(1)}%`
        : '  - 未设置个人留金目标';

      sections.push(`\n## 账号：${tag}\n### 近12个月月度数据\n${monthlyLines}\n\n### 汇总\n  - 总收入：¥${d.totalIncome.toFixed(2)}\n  - 日常支出：¥${d.totalExpense.toFixed(2)}\n  - 信用卡还款：¥${d.totalRepayment.toFixed(2)}\n  - 净留金：¥${d.netBalance.toFixed(2)}\n${goalLine}\n\n### 收入分类\n${formatCatMap(d.incomeCatMap)}\n\n### 支出分类\n${formatCatMap(d.expenseCatMap)}`);
    }

    if (hasFamily) {
      const familyGoalLine = familyGoal
        ? `  - 家庭留金目标：¥${parseFloat(familyGoal.amount.toString()).toFixed(2)}，当前完成度：${Math.min((familyTotal.netBalance / parseFloat(familyGoal.amount.toString())) * 100, 100).toFixed(1)}%\n  - 目标备注：${familyGoal.note || '无'}`
        : '  - 未设置家庭留金目标';
      sections.push(`\n## 家庭合计\n  - 总收入：¥${familyTotal.totalIncome.toFixed(2)}\n  - 日常支出：¥${familyTotal.totalExpense.toFixed(2)}\n  - 信用卡还款：¥${familyTotal.totalRepayment.toFixed(2)}\n  - 净留金：¥${familyTotal.netBalance.toFixed(2)}\n${familyGoalLine}`);
    }

    const memberNames = memberDataList.map((m) => (m.isSelf ? `${m.username}（本人）` : m.username)).join('、');
    const hasGoal = personalGoal || familyGoal;
    const analysisItems = hasFamily
      ? `请分析以下方面，总字数控制在900字以内：\n1. **各账号收支健康度评估**（分别分析 ${memberNames}）\n2. **各账号支出结构分析**\n3. **信用卡还款压力分析**\n4. **家庭整体收支状况分析**\n5. **优化建议**（针对家庭整体给出3条具体可行建议）${hasGoal ? '\n6. **留金目标达成策略**（结合当前趋势，给出具体的达成路径和时间预测）' : ''}`
      : `请分析以下方面，总字数控制在600字以内：\n1. **收支健康度评估**\n2. **支出结构分析**\n3. **信用卡还款压力分析**\n4. **优化建议**（给出2-3条具体可行建议）${hasGoal ? '\n5. **留金目标达成策略**（结合当前趋势，给出具体的达成路径和时间预测）' : ''}`;

    sections.push(`\n${analysisItems}`);
    const prompt = sections.join('\n');

    const requestBody = {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1600,
      temperature: 0.7,
    };

    // 详细调用日志
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║       AI Analyze Request (Background)    ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`[AI] Time        : ${new Date().toISOString()}`);
    console.log(`[AI] User        : id=${userId}, name=${usernameMap[userId]}`);
    console.log(`[AI] Endpoint    : ${baseUrl}/chat/completions`);
    console.log(`[AI] Model       : ${model}`);
    console.log(`[AI] Members     : [${familyIds.join(', ')}] (${familyIds.length} accounts, hasFamily=${hasFamily})`);
    console.log(`[AI] FamilyKey   : ${familyKey}`);
    console.log(`[AI] PersonalGoal: ${personalGoal ? `¥${parseFloat(personalGoal.amount.toString()).toFixed(2)}` : 'none'}`);
    console.log(`[AI] FamilyGoal  : ${familyGoal ? `¥${parseFloat(familyGoal.amount.toString()).toFixed(2)}` : 'none'}`);
    console.log(`[AI] max_tokens  : ${requestBody.max_tokens}`);
    console.log(`[AI] PromptLen   : ${prompt.length} chars`);

    let aiResponse;
    try {
      aiResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (fetchErr) {
      throw new Error(`网络错误，无法连接 AI 接口：${fetchErr.message}`);
    }

    console.log(`[AI] HTTP Status : ${aiResponse.status} ${aiResponse.statusText}`);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI 接口返回 ${aiResponse.status}：${errText}`);
    }

    const aiJson = await aiResponse.json();
    const content = aiJson.choices?.[0]?.message?.content || '';

    if (!content) {
      throw new Error('AI 返回内容为空');
    }

    const newRecord = await prisma.aiAnalysisRecord.create({
      data: {
        familyKey,
        content,
        netBalance:     familyTotal.netBalance,
        totalIncome:    familyTotal.totalIncome,
        totalExpense:   familyTotal.totalExpense,
        totalRepayment: familyTotal.totalRepayment,
      },
    });
    console.log(`[AI] Analysis saved: id=${newRecord.id}, familyKey=${familyKey}, chars=${content.length}`);

  } catch (err) {
    console.error('[AI] Background job error:', err.message || err);
  }
}

// POST /api/ai/analyze — 立即返回 202，后台异步执行分析
router.post('/analyze', auth, async (req, res) => {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!apiKey) {
    return res.status(503).json({ message: 'AI 功能未配置，请在服务端设置 AI_API_KEY' });
  }

  res.status(202).json({ message: '分析中，请稍后查看分析结果' });

  runAnalysisJob(req.user.id, apiKey, baseUrl, model);
});
// GET /api/ai/last  —— 获取最近一次分析结果（页面加载时使用）
router.get('/last', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const familyIds = await getFamilyUserIds(userId);
    const familyKey = familyIds.length > 1
      ? familyIds.slice().sort((a, b) => a - b).map((id) => `u${id}`).join('_')
      : `u${userId}`;

    const [last, prev] = await prisma.aiAnalysisRecord.findMany({
      where: { familyKey },
      orderBy: { createdAt: 'desc' },
      take: 2,
    }).then((rows) => [rows[0] || null, rows[1] || null]);

    if (!last) return res.json({ record: null, comparison: null });

    let comparison = null;
    if (prev) {
      const currNet = parseFloat(last.netBalance.toString());
      const prevNet = parseFloat(prev.netBalance.toString());
      const currInc = parseFloat(last.totalIncome.toString());
      const prevInc = parseFloat(prev.totalIncome.toString());
      const currExp = parseFloat(last.totalExpense.toString());
      const prevExp = parseFloat(prev.totalExpense.toString());
      const currRep = parseFloat(last.totalRepayment.toString());
      const prevRep = parseFloat(prev.totalRepayment.toString());
      const netBalanceDiff   = +(currNet - prevNet).toFixed(2);
      const totalIncomeDiff  = +(currInc - prevInc).toFixed(2);
      const totalExpenseDiff = +(currExp - prevExp).toFixed(2);
      const repaymentDiff    = +(currRep - prevRep).toFixed(2);
      const score = netBalanceDiff + totalIncomeDiff - totalExpenseDiff - repaymentDiff;
      comparison = {
        prevCreatedAt: prev.createdAt.toISOString(),
        netBalanceDiff,
        totalIncomeDiff,
        totalExpenseDiff,
        repaymentDiff,
        trend: score > 0 ? 'improved' : score < 0 ? 'worsened' : 'unchanged',
      };
    }

    return res.json({
      record: {
        content:    last.content,
        createdAt:  last.createdAt.toISOString(),
        netBalance: parseFloat(last.netBalance.toString()),
      },
      comparison,
    });
  } catch (err) {
    console.error('[AI] /last error:', err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
