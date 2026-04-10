const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');
const { getFamilyUserIds } = require('./family');

const router = express.Router();

const toNum = (v) => parseFloat((v || 0).toString());

// Resolve target user IDs based on scope
async function resolveStatUserIds(requesterId, scope) {
  if (!scope || scope === 'mine') return [requesterId];
  if (scope === 'all') return getFamilyUserIds(requesterId);
  const targetId = parseInt(scope, 10);
  if (isNaN(targetId)) return [requesterId];
  const familyIds = await getFamilyUserIds(requesterId);
  return familyIds.includes(targetId) ? [targetId] : [requesterId];
}

// 获取统计数据
router.get('/', auth, async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const scope = req.query.scope || 'mine';
    const userIds = await resolveStatUserIds(req.user.id, scope);
    const userFilter = userIds.length === 1 ? { userId: userIds[0] } : { userId: { in: userIds } };

    // 并行查询：累计 + 本月已还 + 本月未还 + 本月总数 + 本月已还数 + 历史分组
    const [
      totalAgg,
      paidAgg,
      unpaidAgg,
      totalCount,
      paidCount,
      allGroups,
      paidGroups,
      ledgerIncomeAgg,
      ledgerExpenseAgg,
    ] = await Promise.all([
      prisma.monthlyRepayment.aggregate({
        where: { ...userFilter, isPaid: true, isDeleted: false },
        _sum: { amount: true },
      }),
      prisma.monthlyRepayment.aggregate({
        where: { ...userFilter, year, month, isPaid: true, isDeleted: false },
        _sum: { amount: true },
      }),
      prisma.monthlyRepayment.aggregate({
        where: { ...userFilter, year, month, isPaid: false, isDeleted: false },
        _sum: { amount: true },
      }),
      prisma.monthlyRepayment.count({ where: { ...userFilter, year, month, isDeleted: false } }),
      prisma.monthlyRepayment.count({ where: { ...userFilter, year, month, isPaid: true, isDeleted: false } }),
      // 近12个月总金额分组
      prisma.monthlyRepayment.groupBy({
        by: ['year', 'month'],
        where: { ...userFilter, isDeleted: false },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 12,
        _sum: { amount: true },
      }),
      // 近12个月已还金额分组
      prisma.monthlyRepayment.groupBy({
        by: ['year', 'month'],
        where: { ...userFilter, isPaid: true, isDeleted: false },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 12,
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: { ...userFilter, type: 'INCOME' },
        _sum: { amount: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: { ...userFilter, type: 'EXPENSE' },
        _sum: { amount: true },
      }),
    ]);

    // 构建已还金额 Map
    const paidMap = {};
    for (const g of paidGroups) {
      paidMap[`${g.year}-${g.month}`] = toNum(g._sum.amount);
    }

    const monthly_history = allGroups
      .reverse()
      .map((g) => ({
        label: `${g.year}/${String(g.month).padStart(2, '0')}`,
        paid_amount: paidMap[`${g.year}-${g.month}`] ?? 0,
        total_amount: toNum(g._sum.amount),
      }));

    return res.json({
      total_paid: toNum(totalAgg._sum.amount),
      total_income: toNum(ledgerIncomeAgg._sum.amount),
      total_ledger_expense: toNum(ledgerExpenseAgg._sum.amount),
      current_month: {
        year,
        month,
        paid: toNum(paidAgg._sum.amount),
        unpaid: toNum(unpaidAgg._sum.amount),
        total_count: totalCount,
        paid_count: paidCount,
      },
      monthly_history,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
