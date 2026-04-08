const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');
const { getFamilyUserIds } = require('./family');

const router = express.Router();

// Resolve which userIds to query based on scope param
// scope: "all" | "mine" | "<userId number>"
async function resolveUserIds(requesterId, scope) {
  if (!scope || scope === 'all') {
    return getFamilyUserIds(requesterId);
  }
  if (scope === 'mine') {
    return [requesterId];
  }
  const targetId = parseInt(scope, 10);
  if (isNaN(targetId)) return [requesterId];
  // Verify binding exists
  const binding = await prisma.familyBinding.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId, receiverId: targetId },
        { requesterId: targetId, receiverId: requesterId },
      ],
    },
  });
  if (!binding) return [requesterId];
  return [targetId];
}

router.get('/', auth, async (req, res) => {
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const scope = req.query.scope || 'all';

  // 构建过去 12 个月的列表（含当前月）
  const months = [];
  for (let i = 11; i >= 0; i--) {
    let y = year, m = month - i;
    while (m <= 0) { m += 12; y--; }
    months.push({ year: y, month: m });
  }

  const startDate = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const endDate   = new Date(Date.UTC(year, month, 1)); // exclusive

  try {
    const userIds = await resolveUserIds(req.user.id, scope);

    const [ledgerEntries, repayments] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { userId: { in: userIds }, date: { gte: startDate, lt: endDate } },
        select: { type: true, amount: true, category: true, date: true },
      }),
      prisma.monthlyRepayment.findMany({
        where: {
          userId: { in: userIds },
          OR: months.map((m) => ({ year: m.year, month: m.month })),
        },
        select: { year: true, month: true, amount: true, isPaid: true },
      }),
    ]);

    // 按月份初始化聚合 Map
    const trendMap = {};
    months.forEach((m) => {
      trendMap[`${m.year}-${m.month}`] = {
        year: m.year, month: m.month,
        income: 0, ledger_expense: 0, repayment: 0,
      };
    });

    ledgerEntries.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      if (!trendMap[key]) return;
      const amt = parseFloat(e.amount.toString());
      if (e.type === 'INCOME') trendMap[key].income += amt;
      else trendMap[key].ledger_expense += amt;
    });

    repayments.forEach((r) => {
      const key = `${r.year}-${r.month}`;
      if (trendMap[key]) trendMap[key].repayment += parseFloat(r.amount.toString());
    });

    const trend = months.map((m) => {
      const d = trendMap[`${m.year}-${m.month}`];
      const total_expense = d.ledger_expense + d.repayment;
      return {
        label: `${m.year}/${String(m.month).padStart(2, '0')}`,
        income: +d.income.toFixed(2),
        ledger_expense: +d.ledger_expense.toFixed(2),
        repayment: +d.repayment.toFixed(2),
        total_expense: +total_expense.toFixed(2),
        balance: +(d.income - total_expense).toFixed(2),
      };
    });

    // 当月明细
    const cur = trendMap[`${year}-${month}`];

    const currentLedger = ledgerEntries.filter((e) => {
      const d = new Date(e.date);
      return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
    });
    const currentRepayments = repayments.filter((r) => r.year === year && r.month === month);

    const expenseCatMap = {};
    currentLedger.filter((e) => e.type === 'EXPENSE').forEach((e) => {
      const amt = parseFloat(e.amount.toString());
      expenseCatMap[e.category] = (expenseCatMap[e.category] || 0) + amt;
    });
    const repaymentTotal = currentRepayments.reduce(
      (sum, r) => sum + parseFloat(r.amount.toString()), 0
    );
    if (repaymentTotal > 0) {
      expenseCatMap['还款'] = (expenseCatMap['还款'] || 0) + repaymentTotal;
    }

    const incomeCatMap = {};
    currentLedger.filter((e) => e.type === 'INCOME').forEach((e) => {
      const amt = parseFloat(e.amount.toString());
      incomeCatMap[e.category] = (incomeCatMap[e.category] || 0) + amt;
    });

    const expense_categories = Object.entries(expenseCatMap)
      .map(([category, amount]) => ({ category, amount: +amount.toFixed(2) }))
      .sort((a, b) => b.amount - a.amount);

    const income_categories = Object.entries(incomeCatMap)
      .map(([category, amount]) => ({ category, amount: +amount.toFixed(2) }))
      .sort((a, b) => b.amount - a.amount);

    const total_expense = +(cur.ledger_expense + cur.repayment).toFixed(2);

    return res.json({
      trend,
      current: {
        year, month,
        income: +cur.income.toFixed(2),
        ledger_expense: +cur.ledger_expense.toFixed(2),
        repayment: +cur.repayment.toFixed(2),
        total_expense,
        balance: +(cur.income - total_expense).toFixed(2),
        expense_categories,
        income_categories,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
