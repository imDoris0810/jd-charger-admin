/**
 * 前端 API 客户端：对 functions/api 的薄封装。
 * 只 import config/schema.ts 的类型（禁区：不得修改 schema.ts 本身）。
 * 后端返回结构以 functions/api 为准。
 */
import type {
  ProviderSubmission,
  ReconciliationItem,
  StandardFeeItem,
  SettlementBill,
  WorkOrder,
} from '../config/schema'

// ---- 后端响应形状 ----

/** 核对摘要（对应 functions/api/lib/reconcile.ts 的 ReconciliationSummary） */
export interface ReconciliationSummary {
  work_order_id: number
  claimed_total_cents: number
  system_total_cents: number
  pending_count: number
  pending_diff_cents: number
}

/** 富化的核对明细：附带关联的提交明细与标准项 */
export interface EnrichedReconciliationItem extends ReconciliationItem {
  submission: ProviderSubmission | null
  standard_item: StandardFeeItem | null
}

export interface ReconciliationList {
  work_order_id: number
  items: EnrichedReconciliationItem[]
  summary: ReconciliationSummary
}

/** 服务商提交页信息（GET /api/submit/:token） */
export interface SubmitWorkOrder {
  id: number
  jd_order_no: string
  provider_name: string
  address: string
  install_date: string
  status: WorkOrder['status']
}

export interface SubmitInfo {
  work_order: SubmitWorkOrder
  standard_items: StandardFeeItem[]
}

/** 服务商提交的一条明细（POST /api/submissions 的 items 元素） */
export interface SubmissionItemInput {
  item_name: string
  quantity: number | null
  unit_price_cents: number | null
  subtotal_cents: number
}

// ---- 请求封装 ----

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) {
    throw new Error(data && typeof data.error === 'string' ? data.error : `请求失败（${res.status}）`)
  }
  return data as T
}

export const api = {
  // ---- 工单 ----
  listWorkOrders: (params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.q) qs.set('q', params.q)
    const q = qs.toString()
    return request<{ work_orders: WorkOrder[] }>(`/api/work-orders${q ? `?${q}` : ''}`)
  },
  getWorkOrder: (id: number) => request<{ work_order: WorkOrder }>(`/api/work-orders/${id}`),
  createWorkOrder: (body: {
    jd_order_no: string
    provider_name: string
    address: string
    install_date: string
  }) =>
    request<{ work_order: WorkOrder }>('/api/work-orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ---- 核对 ----
  listReconciliation: (workOrderId: number) =>
    request<ReconciliationList>(`/api/reconciliation-items?work_order_id=${workOrderId}`),
  generateReconciliation: (workOrderId: number) =>
    request<ReconciliationList>('/api/reconciliation-items', {
      method: 'POST',
      body: JSON.stringify({ work_order_id: workOrderId }),
    }),
  handleReconciliationItem: (
    id: number,
    body: { action: 'accept' | 'reject' | 'match'; standard_item_id?: number; note?: string },
  ) =>
    request<{ item: ReconciliationItem }>(`/api/reconciliation-items/${id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ---- 标准费用库 ----
  listStandardItems: () => request<{ items: StandardFeeItem[] }>('/api/standard-fee-items'),
  createStandardItem: (body: {
    name: string
    calc_method: string
    unit_price_cents: number | null
    included_in_base_fee: number
    remark?: string | null
  }) =>
    request<{ item: StandardFeeItem }>('/api/standard-fee-items', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateStandardItem: (
    id: number,
    body: Partial<{
      name: string
      calc_method: string
      unit_price_cents: number | null
      included_in_base_fee: number
      remark: string | null
      is_active: number
    }>,
  ) =>
    request<{ item: StandardFeeItem }>(`/api/standard-fee-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // ---- 服务商提交（免登录）----
  getSubmitInfo: (token: string) => request<SubmitInfo>(`/api/submit/${token}`),
  submitProvider: (token: string, items: SubmissionItemInput[]) =>
    request<{ ok: boolean; work_order_id: number; submitted_count: number }>('/api/submissions', {
      method: 'POST',
      body: JSON.stringify({ token, items }),
    }),

  // ---- 结算 ----
  createSettlement: (workOrderId: number) =>
    request<{ bill: SettlementBill }>('/api/settlements', {
      method: 'POST',
      body: JSON.stringify({ work_order_id: workOrderId }),
    }),
  getSettlement: (workOrderId: number) =>
    request<{ bill: SettlementBill }>(`/api/settlements?work_order_id=${workOrderId}`),

  // ---- 数据看板 ----
  getDashboard: () => request<DashboardSummary>('/api/dashboard/summary'),
}

// ---- 数据看板响应形状 ----

export interface DashboardKpis {
  month_orders: number
  pending_review: number
  month_amount_cents: number
  avg_reconcile_minutes: number | null
  dispute_rate: number
}

export interface DashboardMonthly {
  month: string
  amount_cents: number
}

export interface DashboardProviderShare {
  provider_name: string
  amount_cents: number
}

export interface DashboardPendingItem {
  work_order_id: number
  jd_order_no: string
  provider_name: string
  item_name: string
  amount_cents: number
  status: ReconciliationItem['status']
}

export interface DashboardSummary {
  kpis: DashboardKpis
  monthly: DashboardMonthly[]
  provider_share: DashboardProviderShare[]
  pending_items: DashboardPendingItem[]
}
