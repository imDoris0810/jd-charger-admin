# 数据库设计（schema）

> 项目：京东充电桩安装费用核对平台
> 数据库：Cloudflare D1（SQLite 语法）
> 对应迁移：`migrations/0001_init.sql`

## 1. 设计约定

- **金额单位**：所有金额以「分」为单位存储为 `INTEGER`，避免浮点误差。示例：660.00 元 → `66000`。
- **时间戳**：统一 `TEXT`（UTC，默认 `datetime('now')`）；纯日期（安装完成日期）用 `TEXT 'YYYY-MM-DD'`。
- **布尔值**：SQLite 无原生 BOOLEAN，统一 `INTEGER 0/1`（0 否 / 1 是）。
- **主键**：业务表使用自增整数代理主键 `id INTEGER PRIMARY KEY AUTOINCREMENT`；业务唯一键单独加 `UNIQUE` 约束（如 `jd_order_no`、`bill_no`）。
- **外键**：SQLite 外键为标准语法；如需强制级联，应用连接时执行 `PRAGMA foreign_keys = ON`（D1 是否默认强制取决于连接设置）。
- **软删除/禁用**：标准费用库「全局固定」，不物理删除，用 `is_active` 停用。

## 2. ER 关系概览

```
work_orders         1 ──< provider_submissions     （一个工单多条服务商提交明细）
work_orders         1 ──< reconciliation_items     （一个工单多条核对明细）
provider_submissions 1 ──< reconciliation_items     （合并一致场景：多条提交聚合为一条核对）
standard_fee_items  1 ──< reconciliation_items     （一个标准项被多条核对引用）
work_orders         1 ──0..1 settlement_bills      （一个工单最多一张结算账单）
```

## 3. 表定义

### 3.1 work_orders（核对任务单）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PK, AUTOINCREMENT | 工单 ID（代理主键） |
| jd_order_no | TEXT | NOT NULL, UNIQUE | 京东工单号（如 WO-2026-0912，从京东服务+ 系统复制） |
| provider_name | TEXT | NOT NULL | 服务商名称 |
| address | TEXT | NOT NULL | 项目地址 |
| install_date | TEXT | NOT NULL | 安装完成日期 'YYYY-MM-DD' |
| status | TEXT | NOT NULL, CHECK | 状态，见 4.1 |
| submit_token | TEXT | UNIQUE | 服务商提交链接 token，构成 `/submit/{token}`；创建时生成 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |

### 3.2 standard_fee_items（标准费用库，全局固定）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PK, AUTOINCREMENT | 费用项 ID |
| name | TEXT | NOT NULL, UNIQUE | 费用项名称 |
| calc_method | TEXT | NOT NULL, CHECK | 计算方式，见 4.2 |
| unit_price_cents | INTEGER | — | 标准单价（分）；`actual`（据实填写）为 NULL |
| included_in_base_fee | INTEGER | NOT NULL, DEFAULT 0 | 是否含在合同基础费内（1/0） |
| is_active | INTEGER | NOT NULL, DEFAULT 1 | 是否启用（1/0） |
| remark | TEXT | — | 备注说明 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |

### 3.3 provider_submissions（服务商提交明细）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PK, AUTOINCREMENT | 提交 ID |
| work_order_id | INTEGER | NOT NULL, FK | 关联工单 ID |
| item_name | TEXT | NOT NULL | 费用项名称（服务商自填，如「搬运费」「高空作业费」） |
| quantity | REAL | — | 数量/距离（米数可为小数；据实填写可为 NULL） |
| unit_price_cents | INTEGER | — | 单价（分） |
| subtotal_cents | INTEGER | NOT NULL | 小计金额（分） |
| submitted_at | TEXT | NOT NULL | 提交时间 |
| is_locked | INTEGER | NOT NULL, DEFAULT 0 | 是否锁定（生成账单后锁定，1/0） |

### 3.4 reconciliation_items（核对明细，系统自动生成）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PK, AUTOINCREMENT | 核对 ID |
| work_order_id | INTEGER | NOT NULL, FK | 关联工单 ID |
| submission_id | INTEGER | FK, 可空 | 关联服务商提交 ID（合并一致聚合多条，此处记录主关联） |
| standard_item_id | INTEGER | FK, 可空 | 匹配到的标准费用项 ID（未识别为 NULL） |
| amount_diff_cents | INTEGER | NOT NULL, DEFAULT 0 | 差额金额（分，可为负） |
| status | TEXT | NOT NULL, CHECK | 状态，见 4.3 |
| manual_note | TEXT | — | 人工处理备注 |
| handled_by | TEXT | — | 处理人 |
| handled_at | TEXT | — | 处理时间 |
| created_at | TEXT | NOT NULL | 生成时间 |

### 3.5 settlement_bills（结算账单）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | PK, AUTOINCREMENT | 账单 ID |
| work_order_id | INTEGER | NOT NULL, UNIQUE, FK | 关联工单 ID（1:1） |
| bill_no | TEXT | NOT NULL, UNIQUE | 账单编号（SET-XXXX） |
| claimed_total_cents | INTEGER | NOT NULL | 服务商申报总额（分） |
| deduction_cents | INTEGER | NOT NULL, DEFAULT 0 | 核减金额（分） |
| payable_total_cents | INTEGER | NOT NULL | 最终应付金额（分） |
| status | TEXT | NOT NULL, CHECK | 账单状态，见 4.4 |
| pdf_url | TEXT | — | PDF 导出链接 |
| created_at | TEXT | NOT NULL | 创建时间 |

## 4. 状态枚举

### 4.1 work_orders.status

| 值 | 含义 | 原型标签 |
| --- | --- | --- |
| pending_submit | 待提交 | 待提交 |
| pending_review | 待核对 | 待核对 |
| reviewed | 已核对 | 已核对 |
| settled | 已结算 | 已结算 |
| disputed | 争议中 | 争议中 |

### 4.2 standard_fee_items.calc_method

| 值 | 含义 | 对应标准项 |
| --- | --- | --- |
| fixed | 固定费用 | 基础安装 |
| per_meter | 单价/米 × 距离 | 桥架综合施工、电缆穿管 |
| per_unit | 固定/个 | 断路器安装 |
| actual | 据实填写（无标准单价） | 其他增项 |

> 注：需求里「计算方式」仅列了 `fixed/per_meter/per_unit` 三种，但 BRD 中「其他增项」为「据实填写」（无标准单价），故补充第 4 种 `actual` 以覆盖该标准项。

### 4.3 reconciliation_items.status

| 值 | 含义 | 原型标签（颜色） |
| --- | --- | --- |
| consistent | 一致 | 一致（绿） |
| merged_consistent | 合并一致 | 合并一致（青） |
| amount_diff | 金额差异 | 金额差异（黄） |
| contract_included | 合同已含 | 合同已含（红） |
| unrecognized | 未识别 | 未识别（灰） |

### 4.4 settlement_bills.status

| 值 | 含义 |
| --- | --- |
| issued | 已生成（待业务侧确认） |
| settled | 已结算 |
| voided | 已作废 |

## 5. 关系与业务约束说明

- 一条工单（work_orders）可有多条服务商提交明细（provider_submissions）。
- 系统按标准库自动生成核对明细（reconciliation_items）：一条提交明细通常生成一条核对明细；「合并一致」场景多条提交聚合为一条（如桥架材料费 + 安装费 → 桥架综合施工）。
- 核对明细通过 `standard_item_id` 关联标准项；未识别时为空，待人工匹配。
- 一个工单核对完成后生成至多一张结算账单（`work_order_id` UNIQUE 保证 1:1）。
- 生成账单后，相关 `provider_submissions` 置 `is_locked=1`，防止被篡改。
