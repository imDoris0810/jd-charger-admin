-- =====================================================================
-- 京东充电桩安装费用核对平台 · 数据库初始化
-- Cloudflare D1（SQLite 语法）· migrations/0001_init.sql
--
-- 设计约定：
--   1. 金额统一以「分」为单位存储为 INTEGER，避免浮点误差；
--      示例：660.00 元 -> 66000。
--   2. 时间戳统一为 TEXT（UTC，datetime('now') 默认值）；
--      纯日期（安装完成日期）为 TEXT 'YYYY-MM-DD'。
--   3. 布尔值用 INTEGER 0/1 表示（SQLite 无原生 BOOLEAN）。
--   4. 外键约束为 SQLite 标准语法；如需强制级联，应用连接时执行
--      PRAGMA foreign_keys = ON。
-- =====================================================================

-- ---------- 1. work_orders 核对任务单 ----------
CREATE TABLE IF NOT EXISTS work_orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  jd_order_no   TEXT    NOT NULL UNIQUE,            -- 京东工单号（如 WO-2026-0912）
  provider_name TEXT    NOT NULL,                   -- 服务商名称
  address       TEXT    NOT NULL,                   -- 项目地址
  install_date  TEXT    NOT NULL,                   -- 安装完成日期 'YYYY-MM-DD'
  status        TEXT    NOT NULL DEFAULT 'pending_submit'
                CHECK (status IN ('pending_submit','pending_review','reviewed','settled','disputed')),
  submit_token  TEXT    UNIQUE,                     -- 服务商提交链接 token：/submit/{token}
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_work_orders_status   ON work_orders (status);
CREATE INDEX IF NOT EXISTS idx_work_orders_provider ON work_orders (provider_name);

-- ---------- 2. standard_fee_items 标准费用库（全局固定） ----------
CREATE TABLE IF NOT EXISTS standard_fee_items (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT    NOT NULL UNIQUE,      -- 费用项名称（基础安装/桥架综合施工/…）
  calc_method          TEXT    NOT NULL
                       CHECK (calc_method IN ('fixed','per_meter','per_unit','actual')),
  unit_price_cents     INTEGER,                      -- 标准单价（分）；actual（据实填写）为 NULL
  included_in_base_fee INTEGER NOT NULL DEFAULT 0,   -- 是否含在合同基础费内（1/0）
  is_active            INTEGER NOT NULL DEFAULT 1,   -- 是否启用（1/0）
  remark               TEXT,                         -- 备注说明
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 3. provider_submissions 服务商提交明细 ----------
CREATE TABLE IF NOT EXISTS provider_submissions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id    INTEGER NOT NULL,
  item_name        TEXT    NOT NULL,                 -- 费用项名称（服务商自填，如「搬运费」）
  quantity         REAL,                             -- 数量/距离（米数可为小数；据实填写可为 NULL）
  unit_price_cents INTEGER,                          -- 单价（分）
  subtotal_cents   INTEGER NOT NULL,                 -- 小计金额（分）
  submitted_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  is_locked        INTEGER NOT NULL DEFAULT 0,       -- 是否锁定（生成账单后锁定，1/0）
  FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_order ON provider_submissions (work_order_id);

-- ---------- 4. reconciliation_items 核对明细（系统自动生成） ----------
CREATE TABLE IF NOT EXISTS reconciliation_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id     INTEGER NOT NULL,
  submission_id     INTEGER,                         -- 关联服务商提交明细（合并一致可聚合多条，记录主关联）
  standard_item_id  INTEGER,                         -- 匹配到的标准费用项（未识别为 NULL）
  amount_diff_cents INTEGER NOT NULL DEFAULT 0,      -- 差额金额（分，可为负）
  status            TEXT    NOT NULL
                    CHECK (status IN ('consistent','merged_consistent','amount_diff','contract_included','unrecognized')),
  manual_note       TEXT,                            -- 人工处理备注
  handled_by        TEXT,                            -- 处理人
  handled_at        TEXT,                            -- 处理时间
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (work_order_id)    REFERENCES work_orders (id)          ON DELETE CASCADE,
  FOREIGN KEY (submission_id)    REFERENCES provider_submissions (id) ON DELETE SET NULL,
  FOREIGN KEY (standard_item_id) REFERENCES standard_fee_items (id)   ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recon_order      ON reconciliation_items (work_order_id);
CREATE INDEX IF NOT EXISTS idx_recon_submission ON reconciliation_items (submission_id);
CREATE INDEX IF NOT EXISTS idx_recon_standard   ON reconciliation_items (standard_item_id);
CREATE INDEX IF NOT EXISTS idx_recon_status     ON reconciliation_items (status);

-- ---------- 5. settlement_bills 结算账单 ----------
CREATE TABLE IF NOT EXISTS settlement_bills (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id       INTEGER NOT NULL UNIQUE,       -- 一个工单最多一张账单（1:1）
  bill_no             TEXT    NOT NULL UNIQUE,       -- 账单编号（SET-XXXX）
  claimed_total_cents INTEGER NOT NULL,              -- 服务商申报总额（分）
  deduction_cents     INTEGER NOT NULL DEFAULT 0,    -- 核减金额（分）
  payable_total_cents INTEGER NOT NULL,              -- 最终应付金额（分）
  status              TEXT    NOT NULL DEFAULT 'issued'
                      CHECK (status IN ('issued','settled','voided')),
  pdf_url             TEXT,                          -- PDF 导出链接
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bills_status ON settlement_bills (status);
