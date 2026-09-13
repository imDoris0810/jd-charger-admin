/**
 * 状态 → 展示元数据（文案 / 颜色），沿用 prototype 设计 token。
 * 仅依赖 config/schema.ts 的类型，不修改其定义。
 */
import type { ReconciliationStatus, WorkOrderStatus } from '../config/schema'

export interface StatusMeta {
  /** 状态文案 */
  label: string
  /** 深色文字（用于状态文字） */
  text: string
  /** 浅色背景（用于状态标签底） */
  bg: string
  /** 强调色（用于状态圆点 / 左侧色条） */
  accent: string
}

/** 核对五状态 */
export const RECONCILIATION_STATUS_META: Record<ReconciliationStatus, StatusMeta> = {
  consistent: { label: '一致', text: '#1F7A3D', bg: '#EAF7F0', accent: '#27AE60' },
  merged_consistent: { label: '合并一致', text: '#0F766E', bg: '#E6F7F4', accent: '#0D9488' },
  amount_diff: { label: '金额差异', text: '#92400E', bg: '#FEF6E7', accent: '#B45309' },
  contract_included: { label: '合同已含', text: '#B91C1C', bg: '#FDECEC', accent: '#E74242' },
  unrecognized: { label: '未识别', text: '#374151', bg: '#F3F4F6', accent: '#9CA3AF' },
}

/** 工单状态 */
export const WORK_ORDER_STATUS_META: Record<WorkOrderStatus, StatusMeta> = {
  pending_submit: { label: '待提交', text: '#1E40AF', bg: '#EFF6FF', accent: '#0065BD' },
  pending_review: { label: '待核对', text: '#92400E', bg: '#FEF6E7', accent: '#B45309' },
  reviewed: { label: '已核对', text: '#1F7A3D', bg: '#EAF7F0', accent: '#27AE60' },
  settled: { label: '已结算', text: '#0F766E', bg: '#E6F7F4', accent: '#0D9488' },
  disputed: { label: '争议中', text: '#B91C1C', bg: '#FDECEC', accent: '#E74242' },
}

export function reconciliationStatusMeta(status: ReconciliationStatus): StatusMeta {
  return RECONCILIATION_STATUS_META[status]
}

export function workOrderStatusMeta(status: WorkOrderStatus): StatusMeta {
  return WORK_ORDER_STATUS_META[status]
}
