const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db/prisma');

const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: '用户名、邮箱和密码均为必填项' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: '密码长度不能少于6位' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: '邮箱格式不正确' });
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      return res.status(409).json({ message: '用户名或邮箱已被注册' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, email, passwordHash },
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    return res.status(201).json({
      message: '注册成功',
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error('注册错误:', err);
    return res.status(500).json({ message: '服务器错误，请稍后重试' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: '邮箱和密码均为必填项' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: '邮箱或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: '邮箱或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    return res.json({
      message: '登录成功',
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error('登录错误:', err);
    return res.status(500).json({ message: '服务器错误，请稍后重试' });
  }
});

// ─── SSO 单点登录回调 (mounted at /api/auth/sso-callback) ───
router.get('/sso-callback', async (req, res) => {
  const SSO_URL = process.env.SSO_CENTER_URL || 'http://localhost:3002';
  const APP_KEY = process.env.SSO_APP_KEY || 'credit-card';
  const APP_SECRET = process.env.SSO_APP_SECRET || '';
  const CLIENT = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('缺少授权码');

    // 用授权码换取 SSO 用户信息
    const tokenRes = await fetch(`${SSO_URL}/sso/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, app_key: APP_KEY, app_secret: APP_SECRET }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.code !== 0) {
      return res.redirect(`${CLIENT}/login?error=${encodeURIComponent(tokenData.message)}`);
    }

    const ssoUser = tokenData.data;
    let localUser = null;

    // 1. SSO 中心已记录绑定
    if (ssoUser.binding?.local_user_id) {
      localUser = await prisma.user.findUnique({ where: { id: parseInt(ssoUser.binding.local_user_id) } });
    }

    // 2. 按 ssoUserId 查找
    if (!localUser) {
      localUser = await prisma.user.findFirst({ where: { ssoUserId: ssoUser.sso_user_id } });
    }

    // 3. 按邮箱匹配（SSO 注册邮箱 == 本地账号邮箱）
    if (!localUser && ssoUser.email) {
      localUser = await prisma.user.findUnique({ where: { email: ssoUser.email } });
    }

    // 找到了本地用户 → 直接登录
    if (localUser) {
      // 确保 ssoUserId 已写入
      if (!localUser.ssoUserId) {
        await prisma.user.update({ where: { id: localUser.id }, data: { ssoUserId: ssoUser.sso_user_id } });
      }
      // 通知 SSO 中心绑定关系
      fetch(`${SSO_URL}/sso/bind-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_key: APP_KEY, app_secret: APP_SECRET, sso_user_id: ssoUser.sso_user_id, local_user_id: String(localUser.id) }),
      }).catch(() => {});

      const token = jwt.sign(
        { id: localUser.id, username: localUser.username, email: localUser.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
      );
      const userJson = encodeURIComponent(JSON.stringify({ id: localUser.id, username: localUser.username, email: localUser.email }));
      return res.redirect(`${CLIENT}/sso-login?token=${token}&user=${userJson}`);
    }

    // 没找到本地用户 → 跳转到绑定页面，让用户输入本地账号
    return res.redirect(`${CLIENT}/sso-bind?sso_user_id=${ssoUser.sso_user_id}`);
  } catch (e) {
    console.error('SSO callback error:', e);
    return res.redirect(`${CLIENT}/login?error=${encodeURIComponent(e.message)}`);
  }
});

// ─── SSO 账号绑定接口 ───
router.post('/sso-bind', async (req, res) => {
  const SSO_URL = process.env.SSO_CENTER_URL || 'http://localhost:3002';
  const APP_KEY = process.env.SSO_APP_KEY || 'credit-card';
  const APP_SECRET = process.env.SSO_APP_SECRET || '';

  try {
    const { email, password, sso_user_id } = req.body;
    if (!email || !password || !sso_user_id) {
      return res.status(400).json({ message: '参数不完整' });
    }

    const localUser = await prisma.user.findUnique({ where: { email } });
    if (!localUser) {
      return res.status(404).json({ message: '未找到该邮箱对应的账号，请先在记账工具注册' });
    }

    const valid = await bcrypt.compare(password, localUser.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: '密码错误' });
    }

    // 写入 ssoUserId
    await prisma.user.update({
      where: { id: localUser.id },
      data: { ssoUserId: parseInt(sso_user_id) },
    });

    // 通知 SSO 中心
    fetch(`${SSO_URL}/sso/bind-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_key: APP_KEY, app_secret: APP_SECRET, sso_user_id: parseInt(sso_user_id), local_user_id: String(localUser.id) }),
    }).catch(() => {});

    const token = jwt.sign(
      { id: localUser.id, username: localUser.username, email: localUser.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    return res.json({
      message: '绑定成功',
      token,
      user: { id: localUser.id, username: localUser.username, email: localUser.email },
    });
  } catch (err) {
    console.error('SSO bind error:', err);
    return res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;
