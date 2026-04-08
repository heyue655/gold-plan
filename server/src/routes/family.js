const express = require('express');
const prisma = require('../db/prisma');
const auth = require('../middleware/auth');

const router = express.Router();

// Helper: get all accepted family member IDs for a user (includes self)
async function getFamilyUserIds(userId) {
  const bindings = await prisma.familyBinding.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: userId }, { receiverId: userId }],
    },
    select: { requesterId: true, receiverId: true },
  });
  const ids = new Set([userId]);
  for (const b of bindings) {
    ids.add(b.requesterId);
    ids.add(b.receiverId);
  }
  return [...ids];
}

// GET /api/family — my members + pending received requests
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const bindings = await prisma.familyBinding.findMany({
      where: {
        OR: [{ requesterId: userId }, { receiverId: userId }],
      },
      include: {
        requester: { select: { id: true, username: true, email: true } },
        receiver:  { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Accepted bindings (family members)
    const members = bindings
      .filter((b) => b.status === 'ACCEPTED')
      .map((b) => {
        const other = b.requesterId === userId ? b.receiver : b.requester;
        return { bindingId: b.id, ...other };
      });

    // Pending requests I received
    const pendingReceived = bindings
      .filter((b) => b.status === 'PENDING' && b.receiverId === userId)
      .map((b) => ({ bindingId: b.id, from: b.requester }));

    // Pending requests I sent
    const pendingSent = bindings
      .filter((b) => b.status === 'PENDING' && b.requesterId === userId)
      .map((b) => ({ bindingId: b.id, to: b.receiver }));

    return res.json({ members, pendingReceived, pendingSent });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// POST /api/family/request — send a binding request
router.post('/request', auth, async (req, res) => {
  const { identifier } = req.body; // username or email
  if (!identifier) {
    return res.status(400).json({ message: '请输入用户名或邮箱' });
  }

  try {
    const userId = req.user.id;

    const target = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
      select: { id: true, username: true, email: true },
    });
    if (!target) return res.status(404).json({ message: '未找到该用户' });
    if (target.id === userId) return res.status(400).json({ message: '不能绑定自己' });

    // Check existing binding in either direction
    const existing = await prisma.familyBinding.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: target.id },
          { requesterId: target.id, receiverId: userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'ACCEPTED') return res.status(409).json({ message: '已绑定该用户' });
      if (existing.status === 'PENDING')  return res.status(409).json({ message: '已有待处理的绑定请求' });
      // REJECTED — allow re-request by deleting old record and creating new
      await prisma.familyBinding.delete({ where: { id: existing.id } });
    }

    const binding = await prisma.familyBinding.create({
      data: { requesterId: userId, receiverId: target.id, status: 'PENDING' },
    });

    return res.status(201).json({
      message: '绑定请求已发送，等待对方同意',
      bindingId: binding.id,
      to: target,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// PUT /api/family/:id/accept
router.put('/:id/accept', auth, async (req, res) => {
  const bindingId = parseInt(req.params.id, 10);
  try {
    const binding = await prisma.familyBinding.findFirst({
      where: { id: bindingId, receiverId: req.user.id, status: 'PENDING' },
    });
    if (!binding) return res.status(404).json({ message: '绑定请求不存在或无权限' });

    await prisma.familyBinding.update({
      where: { id: bindingId },
      data: { status: 'ACCEPTED' },
    });
    return res.json({ message: '已同意绑定' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// PUT /api/family/:id/reject
router.put('/:id/reject', auth, async (req, res) => {
  const bindingId = parseInt(req.params.id, 10);
  try {
    const binding = await prisma.familyBinding.findFirst({
      where: { id: bindingId, receiverId: req.user.id, status: 'PENDING' },
    });
    if (!binding) return res.status(404).json({ message: '绑定请求不存在或无权限' });

    await prisma.familyBinding.update({
      where: { id: bindingId },
      data: { status: 'REJECTED' },
    });
    return res.json({ message: '已拒绝绑定' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

// DELETE /api/family/:id — unbind
router.delete('/:id', auth, async (req, res) => {
  const bindingId = parseInt(req.params.id, 10);
  try {
    const binding = await prisma.familyBinding.findFirst({
      where: {
        id: bindingId,
        status: 'ACCEPTED',
        OR: [{ requesterId: req.user.id }, { receiverId: req.user.id }],
      },
    });
    if (!binding) return res.status(404).json({ message: '绑定关系不存在' });

    await prisma.familyBinding.delete({ where: { id: bindingId } });
    return res.json({ message: '已解除绑定' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
module.exports.getFamilyUserIds = getFamilyUserIds;
