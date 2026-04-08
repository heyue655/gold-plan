const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');
const { getFamilyUserIds } = require('./family');

const router = express.Router();

const toNum = (v) => parseFloat((v || 0).toString());

// GET /api/goals
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const familyIds = await getFamilyUserIds(userId);
    const hasFamilyMembers = familyIds.length > 1;

    const [personal, family] = await Promise.all([
      prisma.savingsGoal.findUnique({
        where: { userId_scope: { userId, scope: 'PERSONAL' } },
      }),
      hasFamilyMembers
        ? prisma.savingsGoal.findFirst({
            where: { userId: { in: familyIds }, scope: 'FAMILY' },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve(null),
    ]);

    let familyLiu = null;
    let familyGoalIsOwn = false;
    if (hasFamilyMembers) {
      const [incAgg, expAgg, repAgg] = await Promise.all([
        prisma.ledgerEntry.aggregate({
          where: { userId: { in: familyIds }, type: 'INCOME' },
          _sum: { amount: true },
        }),
        prisma.ledgerEntry.aggregate({
          where: { userId: { in: familyIds }, type: 'EXPENSE' },
          _sum: { amount: true },
        }),
        prisma.monthlyRepayment.aggregate({
          where: { userId: { in: familyIds }, isPaid: true },
          _sum: { amount: true },
        }),
      ]);
      familyLiu =
        toNum(incAgg._sum.amount) -
        toNum(expAgg._sum.amount) -
        toNum(repAgg._sum.amount);
      familyGoalIsOwn = family ? family.userId === userId : false;
    }

    res.json({ personal, family, familyLiu, hasFamilyMembers, familyGoalIsOwn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// PUT /api/goals/personal
router.put('/personal', auth, async (req, res) => {
  try {
    const { amount, note } = req.body;
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      return res.status(400).json({ message: '请输入有效金额' });
    }
    const goal = await prisma.savingsGoal.upsert({
      where: { userId_scope: { userId: req.user.id, scope: 'PERSONAL' } },
      update: { amount: num, note: note || null },
      create: { userId: req.user.id, scope: 'PERSONAL', amount: num, note: note || null },
    });
    res.json(goal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// DELETE /api/goals/personal
router.delete('/personal', auth, async (req, res) => {
  try {
    await prisma.savingsGoal.deleteMany({
      where: { userId: req.user.id, scope: 'PERSONAL' },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// PUT /api/goals/family
router.put('/family', auth, async (req, res) => {
  try {
    const { amount, note } = req.body;
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      return res.status(400).json({ message: '请输入有效金额' });
    }
    const goal = await prisma.savingsGoal.upsert({
      where: { userId_scope: { userId: req.user.id, scope: 'FAMILY' } },
      update: { amount: num, note: note || null },
      create: { userId: req.user.id, scope: 'FAMILY', amount: num, note: note || null },
    });
    res.json(goal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// DELETE /api/goals/family
router.delete('/family', auth, async (req, res) => {
  try {
    await prisma.savingsGoal.deleteMany({
      where: { userId: req.user.id, scope: 'FAMILY' },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
