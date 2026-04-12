const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');
const { getFamilyUserIds } = require('./family');

const router = express.Router();
const toNum = (v) => parseFloat((v || 0).toString());

// ── helpers ──────────────────────────────────────────────
function getMonday(d) {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function buildWeekRanges(startDate, weeks) {
  const ranges = [];
  const monday = getMonday(startDate);
  for (let i = 0; i < weeks; i++) {
    const start = new Date(monday);
    start.setUTCDate(start.getUTCDate() + i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    ranges.push({ weekNumber: i + 1, startDate: start, endDate: end });
  }
  return ranges;
}

function buildFamilyKey(familyIds) {
  return familyIds.length > 1
    ? familyIds.slice().sort((a, b) => a - b).map((id) => `u${id}`).join('_')
    : `u${familyIds[0]}`;
}

// ── 计算某周在某些用户下的实际支出 ──────────────────────
async function computeWeekSpending(userIds, weekStart, weekEnd) {
  const nextDay = new Date(weekEnd);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      userId: { in: userIds },
      type: 'EXPENSE',
      date: { gte: weekStart, lt: nextDay },
    },
    select: { amount: true, category: true },
  });

  let totalSpending = 0;
  const categorySpent = {};
  for (const e of entries) {
    const amt = toNum(e.amount);
    totalSpending += amt;
    categorySpent[e.category] = (categorySpent[e.category] || 0) + amt;
  }
  return { totalSpending: +totalSpending.toFixed(2), categorySpent };
}

// 周状态：预算控制视角
function weekStatus(weekStart, weekEnd, actualSpending, budgetAmount) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const startStr = weekStart.toISOString().split('T')[0];
  const endStr   = weekEnd.toISOString().split('T')[0];

  if (todayStr < startStr)  return 'UPCOMING';
  if (todayStr >= startStr && todayStr <= endStr) return 'IN_PROGRESS';
  // past week: under budget = good, over = bad
  return actualSpending <= toNum(budgetAmount) ? 'UNDER_BUDGET' : 'OVER_BUDGET';
}

// ── collect data for AI ─────────────────────────────────
async function collectFinancialData(userIds, monthsBack = 3) {
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - monthsBack, 1));
  const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
  // 仅用已完成的月份做均值（排除当月不完整数据）
  const avgEndDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

  const [entries, repayments, goals] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { userId: { in: userIds }, date: { gte: startDate, lt: endDate } },
      select: { type: true, amount: true, category: true, note: true, date: true, userId: true },
      orderBy: { date: 'desc' },
    }),
    prisma.monthlyRepayment.findMany({
      where: { userId: { in: userIds }, isDeleted: false },
      select: { year: true, month: true, amount: true, isPaid: true, userId: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.savingsGoal.findMany({
      where: { userId: { in: userIds } },
    }),
  ]);

  // separate expense entries for AI (with notes)
  const expenseEntries = entries
    .filter((e) => e.type === 'EXPENSE')
    .map((e) => ({
      date: e.date.toISOString().split('T')[0],
      category: e.category,
      amount: toNum(e.amount),
      note: e.note || '',
    }));

  // aggregate income（仅已完成月份）
  let totalMonthlyIncome = 0;
  const incomeEntries = entries.filter((e) => e.type === 'INCOME' && new Date(e.date) < avgEndDate);
  for (const e of incomeEntries) totalMonthlyIncome += toNum(e.amount);
  const avgMonthlyIncome = +(totalMonthlyIncome / monthsBack).toFixed(2);

  // aggregate expenses by category（仅已完成月份）
  let totalExpense = 0;
  const catAgg = {};
  const completedExpenses = expenseEntries.filter((e) => new Date(e.date) < avgEndDate);
  for (const e of completedExpenses) {
    totalExpense += e.amount;
    if (!catAgg[e.category]) catAgg[e.category] = { total: 0, count: 0, notes: {} };
    catAgg[e.category].total += e.amount;
    catAgg[e.category].count += 1;
    if (e.note) {
      catAgg[e.category].notes[e.note] = (catAgg[e.category].notes[e.note] || 0) + 1;
    }
  }
  const avgMonthlyExpense = +(totalExpense / monthsBack).toFixed(2);

  // format category summary
  const categoryBreakdown = Object.entries(catAgg)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, data]) => {
      const topNotes = Object.entries(data.notes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([note, count]) => `${note}(${count}次)`);
      return {
        category: cat,
        totalAmount: +data.total.toFixed(2),
        avgMonthly: +(data.total / monthsBack).toFixed(2),
        avgWeekly: +(data.total / monthsBack / 4.33).toFixed(2),
        count: data.count,
        topNotes,
      };
    });

  // upcoming repayments (next 3 months)
  const upcomingRepayments = repayments
    .filter((r) => !r.isPaid && new Date(r.dueDate) >= now)
    .slice(0, 20)
    .map((r) => ({
      amount: toNum(r.amount),
      dueDate: r.dueDate.toISOString().split('T')[0],
    }));

  // paid repayments in the analysis period → monthly average（仅已完成月份）
  const paidInPeriod = repayments.filter((r) => {
    if (!r.isPaid) return false;
    const d = new Date(r.dueDate);
    return d >= startDate && d < avgEndDate;
  });
  let totalPaidRepayment = 0;
  for (const r of paidInPeriod) totalPaidRepayment += toNum(r.amount);
  const avgMonthlyRepayment = +(totalPaidRepayment / monthsBack).toFixed(2);

  const personalGoal = goals.find((g) => g.scope === 'PERSONAL');
  const familyGoal = goals.find((g) => g.scope === 'FAMILY');

  // Token control: if too many raw entries, truncate
  let rawEntries = expenseEntries;
  if (rawEntries.length > 500) {
    // keep top 300 by amount + all with notes
    const withNotes = rawEntries.filter((e) => e.note);
    const byAmount = rawEntries.sort((a, b) => b.amount - a.amount).slice(0, 300);
    const merged = new Map();
    for (const e of [...withNotes, ...byAmount]) {
      merged.set(`${e.date}_${e.category}_${e.amount}`, e);
    }
    rawEntries = [...merged.values()].sort((a, b) => b.amount - a.amount);
  }

  return {
    rawEntries,
    categoryBreakdown,
    avgMonthlyIncome,
    avgMonthlyExpense,
    avgMonthlyRepayment,
    upcomingRepayments,
    personalGoalAmount: personalGoal ? toNum(personalGoal.amount) : null,
    familyGoalAmount: familyGoal ? toNum(familyGoal.amount) : null,
  };
}

// ── AI call helper ──────────────────────────────────────
async function callAI(prompt, options = {}) {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o';

  if (!apiKey) throw new Error('AI 功能未配置，请设置 AI_API_KEY');

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: '你是一个专业的家庭财务顾问。请严格按照用户要求的 JSON 格式返回，不要添加任何 markdown 标记或额外文字。' },
      { role: 'user', content: prompt },
    ],
    max_tokens: options.maxTokens || 3000,
    temperature: options.temperature || 0.7,
  };

  console.log(`[AI-SavingsPlan] Calling ${baseUrl}/chat/completions, model=${model}, promptLen=${prompt.length}`);

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI 接口返回 ${resp.status}：${errText}`);
  }

  const json = await resp.json();
  const content = json.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('AI 返回内容为空');

  // Strip markdown code fences if present
  const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

// ── POST /api/savings-plan/generate ─────────────────────
router.post('/generate', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { weeks = 8, savingsTarget, monthlyIncome } = req.body;
    const scope = 'PERSONAL';

    if (weeks < 4 || weeks > 12) {
      return res.status(400).json({ message: '周数需在 4 到 12 之间' });
    }

    // Check if already generating
    const existing = await prisma.savingsPlan.findFirst({
      where: { userId, scope, status: { in: ['GENERATING', 'ACTIVE'] } },
    });
    if (existing && existing.status === 'GENERATING') {
      return res.status(409).json({ message: '计划正在生成中，请勿重复提交' });
    }

    const familyIds = [userId];
    const data = await collectFinancialData(familyIds);

    // Income: user-provided or average
    const income = monthlyIncome ? parseFloat(monthlyIncome) : data.avgMonthlyIncome;
    // Repayment: use average
    const repayment = data.avgMonthlyRepayment;
    // Savings target：按计划周数占全年52周的比例分摊年度留金目标
    let savings = savingsTarget ? parseFloat(savingsTarget) : null;
    if (!savings) {
      if (data.personalGoalAmount && data.personalGoalAmount > 0) {
        savings = +(data.personalGoalAmount * (weeks / 52) / (weeks / 4.33)).toFixed(2);
      } else {
        savings = +(income * 0.2).toFixed(2);
      }
    }

    // Monthly budget = income - repayment - savings (what you CAN spend)
    const budget = +(income - repayment - savings).toFixed(2);
    if (budget <= 0) {
      return res.status(400).json({
        message: `月可用预算为负（收入 ¥${income} - 还款 ¥${repayment} - 留金 ¥${savings} = ¥${budget}），请调整留金目标`,
      });
    }

    const weeklyBudgetAvg = +(budget / 4.33).toFixed(2);
    const weekRanges = buildWeekRanges(new Date(), weeks);

    // Deactivate existing active plan
    if (existing && existing.status === 'ACTIVE') {
      await prisma.savingsPlan.update({
        where: { id: existing.id },
        data: { status: 'ABANDONED' },
      });
    }

    // Create GENERATING placeholder immediately
    const plan = await prisma.savingsPlan.create({
      data: {
        userId,
        scope,
        startDate: weekRanges[0].startDate,
        endDate: weekRanges[weekRanges.length - 1].endDate,
        monthlyIncome: income,
        monthlyRepayment: repayment,
        savingsTarget: savings,
        monthlyBudget: budget,
        aiSummary: '',
        nonEssentialAnalysis: '[]',
        status: 'GENERATING',
      },
    });

    // Send 202 immediately
    res.status(202).json({ message: '正在生成预算计划，请稍候…', planId: plan.id });

    // Build prompt
    const prompt = `根据以下财务数据，为用户制定一个 ${weeks} 周的**花费预算控制计划**。

## 核心公式
- 月收入：¥${income}
- 月均信用卡还款（刚性支出，不可削减）：¥${repayment}
- 留金目标（每月必须锁住的钱）：¥${savings}
- **月可用预算 = 收入 - 还款 - 留金 = ¥${budget}**
- 参考周预算：¥${weeklyBudgetAvg}（按4.33周/月）

用户的目标是：每月锁住 ¥${savings}，还款 ¥${repayment} 由系统扣除，剩余 ¥${budget} 是本月全部可花金额。AI 需要把这个预算分配到每周、每个消费类别。

## 近3个月支出分类汇总（月均）
${data.categoryBreakdown.map((c) =>
  `- ${c.category}：月均 ¥${c.avgMonthly}，周均 ¥${c.avgWeekly}，${c.count}笔${c.topNotes.length > 0 ? '，高频：' + c.topNotes.join('、') : ''}`
).join('\n')}

## 当前月均总支出：¥${data.avgMonthlyExpense}（需削减至 ¥${budget} 以内）

## 近3个月支出明细（含备注，用于识别消费模式）
${data.rawEntries.slice(0, 300).map((e) =>
  `${e.date} | ${e.category} | ¥${e.amount}${e.note ? ' | ' + e.note : ''}`
).join('\n')}

## 即将到期的信用卡还款
${data.upcomingRepayments.length > 0
  ? data.upcomingRepayments.map((r) => `- ${r.dueDate}：¥${r.amount}`).join('\n')
  : '暂无'}

请严格按以下 JSON 格式返回（不要添加任何 markdown 标记）：
{
  "summary": "预算控制策略概述（100-200字，说明当前超支多少、主要从哪些类别削减、整体控制思路）",
  "categoryAnalysis": [
    {
      "category": "类别名",
      "classification": "essential 或 semi-essential 或 non-essential",
      "avgMonthly": 数字（当前月均支出）,
      "suggestedMonthly": 数字（建议月支出上限）,
      "suggestedWeekly": 数字（建议周支出上限）,
      "topPatterns": ["消费模式1 × N次", "消费模式2 × N次"],
      "reason": "分类理由和削减建议（30-60字）"
    }
  ],
  "weeklyPlans": [
    {
      "weekNumber": 1,
      "budgetAmount": 数字（本周总可花预算）,
      "advice": "本周花钱建议（50-100字，具体到哪些钱不该花、哪些可以省）",
      "categoryBudgets": [
        {
          "category": "类别名",
          "weeklyLimit": 数字（本周该类别的花费上限）,
          "tip": "具体操作建议"
        }
      ]
    }
  ]
}

要求：
1. 所有 weeklyPlans 的 budgetAmount 总和 ≈ ¥${budget} × ${weeks}/4.33（即 ${weeks} 周的总可用预算）
2. 每周 categoryBudgets 的 weeklyLimit 总和 ≤ 该周的 budgetAmount
3. categoryBudgets 覆盖所有主要支出类别（5-8个），weeklyLimit 是该类别本周的花费上限
4. 从备注中识别高频消费模式（如"星巴克""外卖""打车"等），给出针对性削减建议
5. 前几周预算可稍宽松（帮助过渡），后几周逐步收紧
6. essential 类别（住房、医疗）给合理预算但不过度削减
7. non-essential 类别（游戏、零食饮料、聚餐等）大力削减
8. 信用卡还款已单独扣除，不要包含在周预算中`;

    // Background job
    (async () => {
      try {
        const aiResult = await callAI(prompt, { maxTokens: 3000 });

        // Update the GENERATING plan to ACTIVE
        await prisma.savingsPlan.update({
          where: { id: plan.id },
          data: {
            aiSummary: aiResult.summary || '',
            nonEssentialAnalysis: JSON.stringify(aiResult.categoryAnalysis || []),
            status: 'ACTIVE',
          },
        });

        // Create weekly targets + category budgets
        for (const wp of (aiResult.weeklyPlans || [])) {
          const range = weekRanges.find((r) => r.weekNumber === wp.weekNumber);
          if (!range) continue;

          const wt = await prisma.weeklyTarget.create({
            data: {
              planId: plan.id,
              weekNumber: wp.weekNumber,
              startDate: range.startDate,
              endDate: range.endDate,
              budgetAmount: wp.budgetAmount || weeklyBudgetAvg,
              aiAdvice: wp.advice || '',
              status: 'UPCOMING',
            },
          });

          if (wp.categoryBudgets && wp.categoryBudgets.length > 0) {
            await prisma.spendingReduction.createMany({
              data: wp.categoryBudgets.map((r) => ({
                weeklyTargetId: wt.id,
                category: r.category,
                description: r.tip || '',
                weeklyLimit: r.weeklyLimit || 0,
              })),
            });
          }
        }

        console.log(`[SavingsPlan] Plan created: id=${plan.id}, weeks=${weeks}, budget=¥${budget}/mo, savings=¥${savings}/mo`);
      } catch (err) {
        console.error('[SavingsPlan] Generate error:', err.message || err);
        // Mark failed plan as ABANDONED so user can retry
        await prisma.savingsPlan.update({
          where: { id: plan.id },
          data: { status: 'ABANDONED' },
        }).catch(() => {});
      }
    })();
  } catch (err) {
    console.error('[SavingsPlan] Generate route error:', err);
    res.status(500).json({ message: '生成预算计划失败' });
  }
});

// ── GET /api/savings-plan/active ────────────────────────
router.get('/active', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const scope = req.query.scope || 'PERSONAL';

    // 支持查看家庭成员的计划
    let targetUserId = currentUserId;
    if (req.query.userId) {
      const memberId = parseInt(req.query.userId, 10);
      if (memberId !== currentUserId) {
        // 验证是否为家庭成员
        const familyIds = await getFamilyUserIds(currentUserId);
        if (!familyIds.includes(memberId)) {
          return res.status(403).json({ message: '无权查看该用户的计划' });
        }
        targetUserId = memberId;
      }
    }

    const plan = await prisma.savingsPlan.findFirst({
      where: { userId: targetUserId, scope, status: { in: ['ACTIVE', 'GENERATING'] } },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: { reductions: true },
        },
      },
    });

    if (!plan) return res.json({ plan: null });

    // If still generating, return minimal info
    if (plan.status === 'GENERATING') {
      return res.json({
        plan: {
          id: plan.id,
          status: 'GENERATING',
          createdAt: plan.createdAt.toISOString(),
        },
      });
    }

    const familyIds = [targetUserId];

    // Compute actual spending for each week
    const weeksWithActuals = await Promise.all(
      plan.weeks.map(async (w) => {
        const { totalSpending, categorySpent } = await computeWeekSpending(
          familyIds, w.startDate, w.endDate
        );
        const status = weekStatus(w.startDate, w.endDate, totalSpending, w.budgetAmount);
        const budgetAmt = toNum(w.budgetAmount);
        const remaining = +(budgetAmt - totalSpending).toFixed(2);

        const reductions = w.reductions.map((r) => ({
          id: r.id,
          category: r.category,
          description: r.description,
          weeklyLimit: toNum(r.weeklyLimit),
          actualSpent: categorySpent[r.category] || 0,
        }));

        return {
          id: w.id,
          weekNumber: w.weekNumber,
          startDate: w.startDate.toISOString().split('T')[0],
          endDate: w.endDate.toISOString().split('T')[0],
          budgetAmount: budgetAmt,
          actualSpending: totalSpending,
          remaining,
          status,
          aiAdvice: w.aiAdvice,
          isAdjusted: w.isAdjusted,
          originalBudget: w.originalBudget ? toNum(w.originalBudget) : null,
          reductions,
        };
      })
    );

    // Calculate totals
    const totalBudget = weeksWithActuals.reduce((s, w) => s + w.budgetAmount, 0);
    const totalSpent = weeksWithActuals
      .filter((w) => w.status !== 'UPCOMING')
      .reduce((s, w) => s + w.actualSpending, 0);
    const totalRemaining = +(totalBudget - totalSpent).toFixed(2);

    return res.json({
      plan: {
        id: plan.id,
        scope: plan.scope,
        startDate: plan.startDate.toISOString().split('T')[0],
        endDate: plan.endDate.toISOString().split('T')[0],
        monthlyIncome: toNum(plan.monthlyIncome),
        monthlyRepayment: toNum(plan.monthlyRepayment),
        savingsTarget: toNum(plan.savingsTarget),
        monthlyBudget: toNum(plan.monthlyBudget),
        totalBudget: +totalBudget.toFixed(2),
        totalSpent: +totalSpent.toFixed(2),
        totalRemaining,
        aiSummary: plan.aiSummary,
        categoryAnalysis: JSON.parse(plan.nonEssentialAnalysis || '[]'),
        status: plan.status,
        createdAt: plan.createdAt.toISOString(),
        weeks: weeksWithActuals,
      },
    });
  } catch (err) {
    console.error('[SavingsPlan] Active route error:', err);
    res.status(500).json({ message: '获取预算计划失败' });
  }
});

// ── GET /api/savings-plan/:id ───────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const planId = parseInt(req.params.id);

    const plan = await prisma.savingsPlan.findFirst({
      where: { id: planId, userId },
      include: {
        weeks: { orderBy: { weekNumber: 'asc' }, include: { reductions: true } },
      },
    });

    if (!plan) return res.status(404).json({ message: '计划不存在' });

    const familyIds = plan.scope === 'FAMILY' ? await getFamilyUserIds(userId) : [userId];

    const weeksWithActuals = await Promise.all(
      plan.weeks.map(async (w) => {
        const { totalSpending, categorySpent } = await computeWeekSpending(familyIds, w.startDate, w.endDate);
        const status = weekStatus(w.startDate, w.endDate, totalSpending, w.budgetAmount);
        const budgetAmt = toNum(w.budgetAmount);
        return {
          id: w.id, weekNumber: w.weekNumber,
          startDate: w.startDate.toISOString().split('T')[0],
          endDate: w.endDate.toISOString().split('T')[0],
          budgetAmount: budgetAmt, actualSpending: totalSpending,
          remaining: +(budgetAmt - totalSpending).toFixed(2),
          status, aiAdvice: w.aiAdvice, isAdjusted: w.isAdjusted,
          originalBudget: w.originalBudget ? toNum(w.originalBudget) : null,
          reductions: w.reductions.map((r) => ({
            id: r.id, category: r.category, description: r.description,
            weeklyLimit: toNum(r.weeklyLimit), actualSpent: categorySpent[r.category] || 0,
          })),
        };
      })
    );

    const totalBudget = weeksWithActuals.reduce((s, w) => s + w.budgetAmount, 0);
    const totalSpent = weeksWithActuals.filter((w) => w.status !== 'UPCOMING').reduce((s, w) => s + w.actualSpending, 0);

    return res.json({
      plan: {
        id: plan.id, scope: plan.scope,
        startDate: plan.startDate.toISOString().split('T')[0],
        endDate: plan.endDate.toISOString().split('T')[0],
        monthlyIncome: toNum(plan.monthlyIncome), monthlyRepayment: toNum(plan.monthlyRepayment),
        savingsTarget: toNum(plan.savingsTarget), monthlyBudget: toNum(plan.monthlyBudget),
        totalBudget: +totalBudget.toFixed(2), totalSpent: +totalSpent.toFixed(2),
        totalRemaining: +(totalBudget - totalSpent).toFixed(2),
        aiSummary: plan.aiSummary, categoryAnalysis: JSON.parse(plan.nonEssentialAnalysis || '[]'),
        status: plan.status, createdAt: plan.createdAt.toISOString(), weeks: weeksWithActuals,
      },
    });
  } catch (err) {
    console.error('[SavingsPlan] Get plan error:', err);
    res.status(500).json({ message: '获取预算计划失败' });
  }
});

// ── POST /api/savings-plan/:id/adjust ───────────────────
router.post('/:id/adjust', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const planId = parseInt(req.params.id);

    const plan = await prisma.savingsPlan.findFirst({
      where: { id: planId, userId, status: 'ACTIVE' },
      include: {
        weeks: {
          orderBy: { weekNumber: 'asc' },
          include: { reductions: true },
        },
      },
    });

    if (!plan) return res.status(404).json({ message: '无活跃的预算计划' });

    const familyIds = plan.scope === 'FAMILY' ? await getFamilyUserIds(userId) : [userId];

    // Compute actuals for all weeks
    const weeksData = await Promise.all(
      plan.weeks.map(async (w) => {
        const { totalSpending, categorySpent } = await computeWeekSpending(
          familyIds, w.startDate, w.endDate
        );
        const status = weekStatus(w.startDate, w.endDate, totalSpending, w.budgetAmount);
        return { ...w, actualSpending: totalSpending, categorySpent, computedStatus: status };
      })
    );

    const pastWeeks = weeksData.filter((w) => w.computedStatus === 'UNDER_BUDGET' || w.computedStatus === 'OVER_BUDGET');
    const futureWeeks = weeksData.filter((w) => w.computedStatus === 'UPCOMING' || w.computedStatus === 'IN_PROGRESS');

    if (futureWeeks.length === 0) {
      return res.status(400).json({ message: '计划已全部完成，无需调整' });
    }

    // Calculate overspend
    const totalOverspend = pastWeeks.reduce((sum, w) => {
      const budget = toNum(w.budgetAmount);
      return sum + Math.max(0, w.actualSpending - budget);
    }, 0);

    const pastSummary = pastWeeks.map((w) =>
      `第${w.weekNumber}周：预算 ¥${toNum(w.budgetAmount)}，实际花费 ¥${w.actualSpending}（${w.computedStatus === 'UNDER_BUDGET' ? '✅未超支' : '❌超支 ¥' + (w.actualSpending - toNum(w.budgetAmount)).toFixed(2)}）`
    ).join('\n');

    const futureWeekNumbers = futureWeeks.map((w) => w.weekNumber);
    const data = await collectFinancialData(familyIds, 1);

    const prompt = `用户的预算控制计划需要动态调整，因为部分周超支。

## 计划基础
- 月收入：¥${toNum(plan.monthlyIncome)}，月还款：¥${toNum(plan.monthlyRepayment)}，留金目标：¥${toNum(plan.savingsTarget)}
- 月可用预算：¥${toNum(plan.monthlyBudget)}
- 原计划策略：${plan.aiSummary}

## 已完成周的执行情况
${pastSummary}

## 累计超支金额：¥${totalOverspend.toFixed(2)}（需从后续周扣回）

## 剩余周：第${futureWeekNumbers.join('、')}周

## 近期消费情况
${data.categoryBreakdown.slice(0, 10).map((c) =>
  `- ${c.category}：周均 ¥${c.avgWeekly}${c.topNotes.length > 0 ? '，高频：' + c.topNotes.join('、') : ''}`
).join('\n')}

请将超支金额从剩余周的预算中扣回（收紧预算），确保留金目标不受影响。
严格按以下 JSON 格式返回（不要添加 markdown 标记）：
{
  "adjustmentReason": "调整原因和新策略（50-100字）",
  "weeklyPlans": [
    {
      "weekNumber": ${futureWeekNumbers[0]},
      "budgetAmount": 数字（调整后的本周可花预算，应比原来更少）,
      "advice": "调整后建议（50-100字，指出哪些类别需要更严格控制）",
      "categoryBudgets": [
        { "category": "类别名", "weeklyLimit": 数字, "tip": "具体建议" }
      ]
    }
  ]
}

要求：
1. weeklyPlans 只包含剩余的周（${futureWeekNumbers.join('、')}）
2. 新的 budgetAmount 总和 = 原剩余周预算总和 − 超支金额（¥${totalOverspend.toFixed(2)}）
3. 超支越严重的类别，后续周给的预算越少
4. 每周 categoryBudgets 包含 5-8 个主要类别`;

    res.status(202).json({ message: '正在调整计划…' });

    (async () => {
      try {
        const aiResult = await callAI(prompt, { maxTokens: 2000 });

        for (const wp of (aiResult.weeklyPlans || [])) {
          const existingWeek = plan.weeks.find((w) => w.weekNumber === wp.weekNumber);
          if (!existingWeek) continue;

          await prisma.weeklyTarget.update({
            where: { id: existingWeek.id },
            data: {
              originalBudget: existingWeek.isAdjusted ? existingWeek.originalBudget : existingWeek.budgetAmount,
              budgetAmount: wp.budgetAmount || toNum(existingWeek.budgetAmount),
              aiAdvice: wp.advice || existingWeek.aiAdvice,
              isAdjusted: true,
            },
          });

          if (wp.categoryBudgets && wp.categoryBudgets.length > 0) {
            await prisma.spendingReduction.deleteMany({ where: { weeklyTargetId: existingWeek.id } });
            await prisma.spendingReduction.createMany({
              data: wp.categoryBudgets.map((r) => ({
                weeklyTargetId: existingWeek.id,
                category: r.category,
                description: r.tip || '',
                weeklyLimit: r.weeklyLimit || 0,
              })),
            });
          }
        }

        console.log(`[SavingsPlan] Plan ${planId} adjusted, overspend=¥${totalOverspend.toFixed(2)}`);
      } catch (err) {
        console.error('[SavingsPlan] Adjust error:', err.message || err);
      }
    })();
  } catch (err) {
    console.error('[SavingsPlan] Adjust route error:', err);
    res.status(500).json({ message: '调整计划失败' });
  }
});

// ── DELETE /api/savings-plan/:id ────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const planId = parseInt(req.params.id);

    const plan = await prisma.savingsPlan.findFirst({
      where: { id: planId, userId },
    });
    if (!plan) return res.status(404).json({ message: '计划不存在' });

    await prisma.savingsPlan.update({
      where: { id: planId },
      data: { status: 'ABANDONED' },
    });

    return res.json({ message: '计划已放弃' });
  } catch (err) {
    console.error('[SavingsPlan] Delete error:', err);
    res.status(500).json({ message: '操作失败' });
  }
});

module.exports = router;
