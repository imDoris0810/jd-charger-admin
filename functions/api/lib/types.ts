/**
 * 数据表行类型（对应 migrations/0001_init.sql）
 * functions 侧独立定义，不跨 src/ 依赖（functions 单独部署）。
 * 金额字段以「分」为单位；布尔以 0/1 表示。
 */

export type WorkOrderStatus =
  | 'pending_submit' // 待提交
  | 'pending_review' // 待核对
  | 'reviewed' // 已核对
  | 'settled' // 已结算
  | 'disputed' // 争议中

export type CalcMethod = 'fixed' | 'per_meter' | 'per_unit' | 'actual'

export type ReconciliationStatus =
  | 'consistent' // 一致
  | 'merged_consistent' // 合并一致
  | 'amount_diff' // 金额差异
  | 'contract_included' // 合同已含
  | 'unrecognized' // 未识别

export type SettlementStatus = 'issued' | 'settled' | 'voided'

/** work_orders 核对任务单 */
export interface WorkOrderRow {
  id: number
  jd_order_no: string
  provider_name: string
  address: string
  install_date: string
  status: WorkOrderStatus
  submit_token: string | null
  created_at: string
  updated_at: string
}

/** standard_fee_items 标准费用库 */
export interface StandardItemRow {
  id: number
  name: string
  calc_method: CalcMethod
  unit_price_cents: number | null
  included_in_base_fee: 0 | 1
  is_active: 0 | 1
  remark: string | null
  created_at: string
  updated_at: string
}

/** provider_submissions 服务商提交明细 */
export interface SubmissionRow {
  id: number
  work_order_id: number
  item_name: string
  quantity: number | null
  unit_price_cents: number | null
  subtotal_cents: number
  submitted_at: string
  is_locked: 0 | 1
}

/** reconciliation_items 核对明细 */
export interface ReconciliationRow {
  id: number
  work_order_id: number
  submission_id: number | null
  standard_item_id: number | null
  amount_diff_cents: number
  status: ReconciliationStatus
  manual_note: string | null
  handled_by: string | null
  handled_at: string | null
  created_at: string
}

/** settlement_bills 结算账单 */
export interface SettlementBillRow {
  id: number
  work_order_id: number
  bill_no: string
  claimed_total_cents: number
  deduction_cents: number
  payable_total_cents: number
  status: SettlementStatus
  pdf_url: string | null
  created_at: string
}
