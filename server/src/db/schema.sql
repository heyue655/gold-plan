-- 留金计划数据库初始化脚本
-- 执行前请先创建数据库: CREATE DATABASE credit_repayment CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS credit_repayment CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE credit_repayment;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 还款计划模板表（每张"信用卡"的固定还款信息）
CREATE TABLE IF NOT EXISTS repayment_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '还款项名称，如：招商信用卡',
  amount DECIMAL(10, 2) NOT NULL COMMENT '默认还款金额',
  due_day TINYINT NOT NULL COMMENT '每月还款日 1-31',
  is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用（软删除）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_user_active (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每月还款实例表（由计划模板按月生成）
CREATE TABLE IF NOT EXISTS monthly_repayments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  user_id INT NOT NULL,
  year SMALLINT NOT NULL,
  month TINYINT NOT NULL COMMENT '月份 1-12',
  amount DECIMAL(10, 2) NOT NULL COMMENT '该月实际还款金额（生成时从模板拷贝）',
  due_date DATE NOT NULL COMMENT '该月具体还款日期',
  is_paid TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已还款',
  paid_at TIMESTAMP NULL DEFAULT NULL COMMENT '还款时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES repayment_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_plan_month (plan_id, year, month),
  INDEX idx_user_year_month (user_id, year, month),
  INDEX idx_user_paid (user_id, is_paid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
