const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

function serializePlan(p) {
  return {
    id: p.id,
    user_id: p.userId,
    name: p.name,
    amount: parseFloat(p.amount.toString()),
    due_day: p.dueDay,
    is_active: p.isActive ? 1 : 0,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// 获取当前用户所有启用的还款计划
router.get('/', auth, async (req, res) => {
  try {
    const plans = await prisma.repaymentPlan.findMany({
      where: { userId: req.user.id, isActive: true },
      orderBy: { dueDay: 'asc' },
    });
    return res.json(plans.map(serializePlan));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// 新增还款计划
router.post('/', auth, async (req, res) => {
  const { name, amount, due_day } = req.body;

  if (!name || !amount || !due_day) {
    return res.status(400).json({ message: '名称、金额和还款日均为必填项' });
  }
  if (due_day < 1 || due_day > 31) {
    return res.status(400).json({ message: '还款日必须在 1-31 之间' });
  }
  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ message: '金额必须大于 0' });
  }

  try {
    const plan = await prisma.repaymentPlan.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        amount: parseFloat(amount),
        dueDay: parseInt(due_day, 10),
      },
    });
    return res.status(201).json(serializePlan(plan));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// 更新还款计划
router.put('/:id', auth, async (req, res) => {
  const { name, amount, due_day } = req.body;
  const planId = parseInt(req.params.id, 10);

  if (!name || !amount || !due_day) {
    return res.status(400).json({ message: '名称、金额和还款日均为必填项' });
  }
  if (due_day < 1 || due_day > 31) {
    return res.status(400).json({ message: '还款日必须在 1-31 之间' });
  }

  try {
    const existing = await prisma.repaymentPlan.findFirst({
      where: { id: planId, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ message: '计划不存在' });
    }

    const updated = await prisma.repaymentPlan.update({
      where: { id: planId },
      data: { name: name.trim(), amount: parseFloat(amount), dueDay: parseInt(due_day, 10) },
    });
    return res.json(serializePlan(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// 删除（软删除）还款计划
router.delete('/:id', auth, async (req, res) => {
  const planId = parseInt(req.params.id, 10);

  try {
    const existing = await prisma.repaymentPlan.findFirst({
      where: { id: planId, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ message: '计划不存在' });
    }

    await prisma.repaymentPlan.update({
      where: { id: planId },
      data: { isActive: false },
    });
    return res.json({ message: '已删除' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
