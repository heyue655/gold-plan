require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./db/prisma');

const authRouter = require('./routes/auth');
const plansRouter = require('./routes/plans');
const repaymentsRouter = require('./routes/repayments');
const statsRouter = require('./routes/stats');
const ledgerRouter = require('./routes/ledger');
const dashboardRouter = require('./routes/dashboard');
const familyRouter = require('./routes/family');
const goalsRouter = require('./routes/goals');
const aiRouter = require('./routes/ai');
const savingsPlanRouter = require('./routes/savingsPlan');
const importRouter = require('./routes/import');

const app = express();

// Disable ETags so API responses always return 200, not 304
app.set('etag', false);

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// 路由
app.use('/api/auth', authRouter);
app.use('/api/plans', plansRouter);
app.use('/api/repayments', repaymentsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/family', familyRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/savings-plan', savingsPlanRouter);
app.use('/api/import', importRouter);

// 健康检查
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// 统一错误处理
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: '服务器内部错误' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`服务器已启动，监听端口 ${PORT}`);
});

// 优雅关闭时断开 Prisma 连接
const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
