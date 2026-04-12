const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');
const { getFamilyUserIds } = require('./family');

const router = express.Router();

function serializeEntry(e) {
  return {
    id: e.id,
    user_id: e.userId,
    username: e.user ? e.user.username : null,
    type: e.type,
    amount: parseFloat(e.amount.toString()),
    category: e.category,
    note: e.note,
    date: e.date instanceof Date ? e.date.toISOString().split('T')[0] : e.date,
    created_at: e.createdAt,
  };
}

// 获取某月记账记录
router.get('/', auth, async (req, res) => {
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();
  const month = req.query.month ? parseInt(req.query.month, 10) : null;
  const scope = req.query.scope || 'all';
  const category = req.query.category || null;
  const type = req.query.type || null;

  const start = month
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date(Date.UTC(year, 0, 1));
  const end = month
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year + 1, 0, 1));

  try {
    let userIds;
    if (!scope || scope === 'all') {
      userIds = await getFamilyUserIds(req.user.id);
    } else if (scope === 'mine') {
      userIds = [req.user.id];
    } else {
      const targetId = parseInt(scope, 10);
      const binding = await prisma.familyBinding.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requesterId: req.user.id, receiverId: targetId },
            { requesterId: targetId,    receiverId: req.user.id },
          ],
        },
      });
      userIds = binding ? [targetId] : [req.user.id];
    }

    const where = { userId: { in: userIds }, date: { gte: start, lt: end } };
    if (category) where.category = category;
    if (type && ['INCOME', 'EXPENSE'].includes(type)) where.type = type;

    const entries = await prisma.ledgerEntry.findMany({
      where,
      include: { user: { select: { username: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    return res.json(entries.map(serializeEntry));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// 新建记账记录
router.post('/', auth, async (req, res) => {
  const { type, amount, category, note, date } = req.body;

  if (!type || !amount || !category || !date) {
    return res.status(400).json({ message: '类型、金额、分类和日期为必填项' });
  }
  if (!['INCOME', 'EXPENSE'].includes(type)) {
    return res.status(400).json({ message: '类型无效' });
  }
  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ message: '金额必须大于 0' });
  }

  try {
    const entry = await prisma.ledgerEntry.create({
      data: {
        userId: req.user.id,
        type,
        amount: parseFloat(amount),
        category,
        note: note || null,
        date: new Date(date),
      },
    });
    return res.status(201).json(serializeEntry(entry));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// 删除记账记录
router.delete('/:id', auth, async (req, res) => {
  const entryId = parseInt(req.params.id, 10);

  try {
    const existing = await prisma.ledgerEntry.findFirst({
      where: { id: entryId, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ message: '记录不存在' });
    }
    await prisma.ledgerEntry.delete({ where: { id: entryId } });
    return res.json({ message: '已删除' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// 修改记账记录
router.put('/:id', auth, async (req, res) => {
  const entryId = parseInt(req.params.id, 10);
  const { type, amount, category, note, date } = req.body;

  if (!type || !amount || !category || !date) {
    return res.status(400).json({ message: '类型、金额、分类和日期为必填项' });
  }
  if (!['INCOME', 'EXPENSE'].includes(type)) {
    return res.status(400).json({ message: '类型无效' });
  }
  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ message: '金额必须大于 0' });
  }

  try {
    const existing = await prisma.ledgerEntry.findFirst({
      where: { id: entryId, userId: req.user.id },
    });
    if (!existing) {
      return res.status(404).json({ message: '记录不存在' });
    }

    const updated = await prisma.ledgerEntry.update({
      where: { id: entryId },
      data: {
        type,
        amount: parseFloat(amount),
        category,
        note: note || null,
        date: new Date(date),
      },
    });
    return res.json(serializeEntry(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
