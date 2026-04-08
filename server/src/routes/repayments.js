const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');
const { getFamilyUserIds } = require('./family');

const router = express.Router();

/** 序列化还款实例为前端期望的 snake_case 格式 */
function serializeRepayment(r) {
  return {
    id: r.id,
    plan_id: r.planId,
    user_id: r.userId,
    year: r.year,
    month: r.month,
    amount: parseFloat(r.amount.toString()),
    due_date: r.dueDate instanceof Date
      ? r.dueDate.toISOString().split('T')[0]
      : r.dueDate,
    is_paid: r.isPaid ? 1 : 0,
    paid_at: r.paidAt,
    created_at: r.createdAt,
    plan_name: r.plan?.name,
    due_day: r.plan?.dueDay,
  };
}

/**
 * 计算指定月份某还款日对应的实际 Date 对象
 * 若该月没有那一天（如2月没有31日），则使用该月最后一天
 */
function getDueDateObj(year, month, dueDay) {
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 为指定用户的指定年月批量生成还款实例（已有的自动跳过）
 */
async function generateMonthlyRepayments(userId, year, month) {
  const plans = await prisma.repaymentPlan.findMany({
    where: { userId, isActive: true },
  });
  if (plans.length === 0) return;

  const data = plans.map((p) => ({
    planId: p.id,
    userId,
    year,
    month,
    amount: p.amount,
    dueDate: getDueDateObj(year, month, p.dueDay),
  }));

  await prisma.monthlyRepayment.createMany({ data, skipDuplicates: true });
}

// 获取指定月份的还款实例（自动生成）
router.get('/', auth, async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
  const queryUserId = req.query.userId ? parseInt(req.query.userId, 10) : null;

  if (month < 1 || month > 12) {
    return res.status(400).json({ message: '月份参数无效' });
  }

  try {
    // 查看其他家庭成员的还款（只读，不自动生成）
    if (queryUserId && queryUserId !== req.user.id) {
      const familyIds = await getFamilyUserIds(req.user.id);
      if (!familyIds.includes(queryUserId)) {
        return res.status(403).json({ message: '无权查看该用户的数据' });
      }
      const rows = await prisma.monthlyRepayment.findMany({
        where: { userId: queryUserId, year, month },
        include: { plan: { select: { name: true, dueDay: true } } },
        orderBy: { dueDate: 'asc' },
      });
      return res.json(rows.map(serializeRepayment));
    }

    // 查看自己的还款（自动生成本月记录）
    await generateMonthlyRepayments(req.user.id, year, month);

    const rows = await prisma.monthlyRepayment.findMany({
      where: { userId: req.user.id, year, month },
      include: { plan: { select: { name: true, dueDay: true } } },
      orderBy: { dueDate: 'asc' },
    });
    return res.json(rows.map(serializeRepayment));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// 切换已还/未还状态
router.patch('/:id/toggle', auth, async (req, res) => {
  const repaymentId = parseInt(req.params.id, 10);

  try {
    const current = await prisma.monthlyRepayment.findFirst({
      where: { id: repaymentId, userId: req.user.id },
    });
    if (!current) {
      return res.status(404).json({ message: '记录不存在' });
    }

    const newPaid = !current.isPaid;
    const updated = await prisma.monthlyRepayment.update({
      where: { id: repaymentId },
      data: { isPaid: newPaid, paidAt: newPaid ? new Date() : null },
      include: { plan: { select: { name: true, dueDay: true } } },
    });
    return res.json(serializeRepayment(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// 修改当月还款金额（允许本月实际金额与模板不同）
router.patch('/:id/amount', auth, async (req, res) => {
  const repaymentId = parseInt(req.params.id, 10);
  const { amount } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ message: '金额必须大于 0' });
  }

  try {
    const existing = await prisma.monthlyRepayment.findFirst({
      where: { id: repaymentId, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ message: '记录不存在' });
    }

    const updated = await prisma.monthlyRepayment.update({
      where: { id: repaymentId },
      data: { amount: parseFloat(amount) },
      include: { plan: { select: { name: true, dueDay: true } } },
    });
    return res.json(serializeRepayment(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
