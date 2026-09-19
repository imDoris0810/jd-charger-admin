/**
 * 版本化配置模型的核心结构（禁区：改动前必须确认；字段结构待从定稿原型反推时再设计）
 * 旧 5 张表设计为 1.0 时期资料（见 memory-bank/schema.md），新版字段结构留待「从定稿原型反推数据库字段」阶段确定。
 * 金额字段一律以「分」为单位（INTEGER），前端显示时 /100 转元。
 */

// ---- 状态枚举 ----

/** 工单状态 */
export type WorkOrderStatus =
  | 'pending_submit' // 待提交
  | 'pending_review' // 待核对
  | 'reviewed' // 已核对
  | 'settled' // 已结算
  | 'disputed' // 争议中

/** 标准费用项计算方式 */
export type CalcMethod = 'fixed' | 'per_meter' | 'per_unit' | 'actual'

/** 核对明细状态 */
export type ReconciliationStatus =
  | 'consistent' // 一致
  | 'merged_consistent' // 合并一致
  | 'amount_diff' // 金额差异
  | 'contract_included' // 合同已含
  | 'unrecognized' // 未识别

/** 结算账单状态 */
export type SettlementStatus = 'issued' | 'settled' | 'voided'

// ---- 数据表类型 ----

/** work_orders 核对任务单 */
export interface WorkOrder {
  id: number
  jd_order_no: string
  provider_name: string
  address: string
  install_date: string // 'YYYY-MM-DD'
  status: WorkOrderStatus
  submit_token: string | null
  created_at: string
  updated_at: string
}

/** standard_fee_items 标准费用库（全局固定） */
export interface StandardFeeItem {
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
export interface ProviderSubmission {
  id: number
  work_order_id: number
  item_name: string
  quantity: number | null
  unit_price_cents: number | null
  subtotal_cents: number
  submitted_at: string
  is_locked: 0 | 1
}

/** reconciliation_items 核对明细（系统自动生成） */
export interface ReconciliationItem {
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
export interface SettlementBill {
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
