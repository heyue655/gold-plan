# 信用卡还款助手

一个多用户的信用卡还款日程管理应用，基于 React + Node.js + MySQL 构建。

## 功能特性

- **用户系统**：注册/登录，JWT 鉴权，多用户数据隔离
- **月度还款计划**：每月自动生成还款实例，勾选标记已还款
- **到期提醒**：3 天内到期高亮橙色警告，已逾期显示红色标识
- **还款进度**：顶部进度条显示当月已还/总额
- **"我的"页面**：累计已还总额、本月统计、历史折线趋势图

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite + MUI v5 + React Router v6 + Recharts |
| 后端 | Node.js + Express 4 |
| 数据库 | MySQL 8+ |
| 鉴权 | JWT (jsonwebtoken) + bcryptjs |

## 快速启动

### 1. 准备 MySQL 数据库

```bash
mysql -u root -p < server/src/db/schema.sql
```

### 2. 配置后端环境变量

```bash
cd server
cp .env.example .env
# 编辑 .env，填写你的 MySQL 密码和 JWT 密钥
```

`.env` 示例：
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=credit_repayment
JWT_SECRET=your_long_random_secret_here
JWT_EXPIRES_IN=30d
PORT=5000
```

### 3. 安装依赖并启动后端

```bash
cd server
npm install
npm run dev     # 开发模式（nodemon 热重载）
# 或
npm start       # 生产模式
```

### 4. 安装依赖并启动前端

```bash
cd client
npm install
npm run dev     # 访问 http://localhost:3000
```

## 项目结构

```
credit-card-repayment/
├── server/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── index.js              # Express 入口
│       ├── db/
│       │   ├── connection.js     # MySQL 连接池
│       │   └── schema.sql        # 建表脚本
│       ├── middleware/
│       │   └── auth.js           # JWT 验证中间件
│       └── routes/
│           ├── auth.js           # 注册/登录
│           ├── plans.js          # 还款计划 CRUD
│           ├── repayments.js     # 月度实例 + 自动生成
│           └── stats.js          # 统计数据
└── client/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx              # 入口 + MUI 主题
        ├── App.jsx               # 路由配置
        ├── api/
        │   └── axios.js          # Axios 封装（自动注入 token）
        ├── context/
        │   └── AuthContext.jsx   # 全局认证状态
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── RegisterPage.jsx
        │   ├── HomePage.jsx      # 首页：月度还款计划
        │   └── MyPage.jsx        # 我的：统计 + 图表
        └── components/
            ├── Layout.jsx        # 带底部导航的布局
            ├── BottomNav.jsx     # 底部导航栏
            ├── RepaymentCard.jsx # 单条还款记录卡片
            └── AddPlanDialog.jsx # 新增计划对话框
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login | 登录 |
| GET | /api/plans | 获取所有启用计划 |
| POST | /api/plans | 新增计划 |
| PUT | /api/plans/:id | 更新计划 |
| DELETE | /api/plans/:id | 删除计划（软删除） |
| GET | /api/repayments?year=&month= | 获取指定月份实例（自动生成） |
| PATCH | /api/repayments/:id/toggle | 切换已还/未还状态 |
| PATCH | /api/repayments/:id/amount | 修改本月实际金额 |
| GET | /api/stats | 获取统计数据 |

## 注意事项

- 还款日为 31 日时，若当月无 31 日（如 2 月），自动映射为该月最后一天
- 删除计划使用软删除，历史已生成的月度实例不受影响
- 每月实例在首次访问该月时按需生成，无需定时任务
