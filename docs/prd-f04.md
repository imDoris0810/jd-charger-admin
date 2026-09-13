# F04 费用核对工作台 · 详细设计

> 项目：京东充电桩安装费用核对平台
> 版本：v1.0
> 关联：`docs/prd.md`（F04）、`memory-bank/schema.md`（表结构）、`memory-bank/design-document.md`（设计决策）

## 1. 概述

### 1.1 目标

服务商提交费用明细后，系统自动将其与京东标准费用库比对，生成逐条核对明细（五种状态）；operator 仅需处理异常项，确认后生成结算账单。

### 1.2 输入 / 输出

- **输入**：工单 `work_orders`（status = `pending_review`）、服务商提交明细 `provider_submissions`（未锁定）、标准费用库 `standard_fee_items`（`is_active=1`）。
- **输出**：核对明细 `reconciliation_items`（五状态）；处理后生成 `settlement_bills`。

## 2. 自动匹配算法（文字描述）

对工单下每条 `provider_submissions`（未锁定）依次执行：

1. **名称精确匹配**：提交明细 `item_name` 与 `standard_fee_items.name`（`is_active=1`）精确比对。
   - 命中 → 进入第 3 步金额比对。
   - 未命中 → 进入第 2 步。

2. **已含费用匹配（合同已含）**：`item_name` 命中「已含费用」规则——由 `included_in_base_fee=1` 的标准项所声明的已含项（如「基础安装」含「搬运 / 入场搬运」）。
   - 命中 → 状态 `contract_included`。
   - 未命中 → 进入第 5 步。

3. **金额比对**（命中标准项后）：
   - 按 `calc_method` 计算标准金额：
     - `fixed`：标准金额 = `unit_price_cents`
     - `per_meter`：标准金额 = `quantity × unit_price_cents`
     - `per_unit`：标准金额 = `quantity × unit_price_cents`
   - 比较 `subtotal_cents` 与标准金额：
     - 相等 → `consistent`
     - 不等 → `amount_diff`（差额 = `subtotal_cents` − 标准金额，写入 `amount_diff_cents`，可为负）

4. **合并一致检测**：若存在多条提交明细名称各异、但语义上同属一个标准项（如「桥架材料费」+「桥架安装费」→「桥架综合施工」），合并其 `subtotal_cents` 后与标准金额比较；相等 → `merged_consistent`。

5. **未识别**：既不匹配任何标准项、也不命中已含规则的提交明细 → `unrecognized`（`standard_item_id` 留空，待人工匹配）。

> **设计说明**：第 2 步「已含费用」与第 4 步「合并映射」采用硬编码关键词简化方案，不新增配置表；关键词列表写在 `functions/api/lib/matcher.ts`（如「搬运」→ 合同已含、「桥架」→ 桥架综合施工），MVP 够用，后续再扩展。

## 3. 五种状态的触发条件

| 状态 | 触发条件 |
| --- | --- |
| consistent（一致） | 名称精确匹配标准项，且 subtotal == 标准金额 |
| merged_consistent（合并一致） | 多条提交映射到同一标准项，合并 subtotal == 标准金额 |
| amount_diff（金额差异） | 名称匹配标准项，但 subtotal != 标准金额 |
| contract_included（合同已含） | 名称命中「已含费用」规则（`included_in_base_fee=1` 声明的已含项） |
| unrecognized（未识别） | 名称不匹配任何标准项，且不命中已含规则 |

## 4. 人工处理与状态流转

| 当前状态 | 人工操作 | 处理后结果 |
| --- | --- | --- |
| consistent | （无，自动通过） | 状态不变 |
| merged_consistent | （无，自动通过） | 状态不变 |
| amount_diff | 接受差额 | status → `consistent`；manual_note 记录「接受差额 +X」 |
| amount_diff | 驳回 | 保留记录；manual_note「已驳回」；金额计入核减 `deduction` |
| contract_included | 确认驳回 | manual_note「已驳回（合同已含）」；金额全额核减 |
| unrecognized | 手动匹配到标准项 | `standard_item_id` 更新；重算差额 → `consistent` 或 `amount_diff` |
| unrecognized | 驳回 | manual_note「已驳回」 |

**确认核对完成的门控**

- 仍存在「异常项」（status ∈ {amount_diff, contract_included, unrecognized} 且无 manual_note）时，「确认核对完成」按钮置灰，悬停提示「还有 X 项需要处理」。
- 全部异常项处理后，「确认核对完成」可用；点击后：生成 `settlement_bills`、锁定相关 `provider_submissions`（`is_locked=1`）、工单 status → `reviewed`。

## 5. 与数据库字段的对应关系

### 5.1 `reconciliation_items` 字段来源

| 字段 | 来源 / 用途 |
| --- | --- |
| work_order_id | 当前核对工单 id |
| submission_id | 对应 `provider_submissions.id`；合并一致时记录主关联（可空） |
| standard_item_id | 匹配结果：匹配到标准项写入其 id；未识别为 NULL，手动匹配后更新 |
| amount_diff_cents | 差额 = `subtotal_cents` − 标准金额（分，可为负） |
| status | 五状态（见第 3 节） |
| manual_note | 人工处理备注（接受 / 驳回 / 匹配说明） |
| handled_by | 处理人（operator） |
| handled_at | 处理时间 |
| created_at | 系统自动生成时间 |

### 5.2 关联表参与方式

- `provider_submissions`：核对输入；提交后未锁定；账单生成后 `is_locked=1`。
- `standard_fee_items`：核对基准；`is_active=0` 的项不参与新增匹配，但不影响历史已生成的 `reconciliation_items`。
- `settlement_bills`：核对完成后生成，金额计算：
  - `claimed_total_cents` = Σ `provider_submissions.subtotal_cents`
  - `deduction_cents` = Σ（被驳回 / 合同已含 的核减金额）
  - `payable_total_cents` = `claimed_total_cents` − `deduction_cents`

### 5.3 状态 → 界面映射

| 状态 | 标签色 | 行左侧色条 | 操作 |
| --- | --- | --- | --- |
| consistent | 绿 | 绿（一致类） | 无 |
| merged_consistent | 青 | 绿（一致类） | 无 |
| amount_diff | 黄 | 红（差异类） | 接受差额 / 驳回 |
| contract_included | 红 | 红（差异类） | 确认驳回 |
| unrecognized | 灰 | 红（差异类） | 手动匹配 / 驳回 |

> 差额列数字另按 +/- 符号着色：正数绿、负数红（见 PRD F04）。
