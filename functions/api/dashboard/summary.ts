/**
 * GET /api/dashboard/summary —— 数据看板统计
 * 对应 memory-bank/architecture.md 端点表。数据量小，聚合在 Worker 内完成（避免 SQLite 日期解析差异）。
 */
import type { Env } from '../lib/env'
import { json } from '../lib/http'
import type { ReconciliationRow, SettlementBillRow, SubmissionRow, WorkOrderRow } from '../lib/types'

function lastNMonths(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** '2026-09-13T…' 与 '2026-09-13 …' 两种格式均取前 7 位 'YYYY-MM' */
const monthOf = (iso: string) => iso.slice(0, 7)

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [ordersRes, billsRes, reconsRes, subsRes] = await Promise.all([
    env.DB.prepare('SELECT * FROM work_orders').all<WorkOrderRow>(),
    env.DB.prepare('SELECT * FROM settlement_bills').all<SettlementBillRow>(),
    env.DB.prepare('SELECT * FROM reconciliation_items').all<ReconciliationRow>(),
    env.DB.prepare('SELECT * FROM provider_submissions').all<SubmissionRow>(),
  ])
  const orders = ordersRes.results ?? []
  const bills = billsRes.results ?? []
  const recons = reconsRes.results ?? []
  const subs = subsRes.results ?? []

  const orderMap = new Map(orders.map((o) => [o.id, o]))
  const subMap = new Map(subs.map((s) => [s.id, s]))

  // ---- KPI ----
  const thisMonth = monthOf(new Date().toISOString())
  const monthOrders = orders.filter((o) => monthOf(o.created_at) === thisMonth).length
  const pendingReview = orders.filter((o) => o.status === 'pending_review').length
  const monthAmountCents = bills
    .filter((b) => monthOf(b.created_at) === thisMonth)
    .reduce((sum, b) => sum + b.payable_total_cents, 0)

  let totalMinutes = 0
  let timedCount = 0
  for (const b of bills) {
    const o = orderMap.get(b.work_order_id)
    if (!o) continue
    const minutes = (new Date(b.created_at).getTime() - new Date(o.created_at).getTime()) / 60000
    if (Number.isFinite(minutes) && minutes >= 0) {
      totalMinutes += minutes
      timedCount++
    }
  }
  const avgReconcileMinutes = timedCount > 0 ? Math.round((totalMinutes / timedCount) * 10) / 10 : null

  const disputedCount = orders.filter((o) => o.status === 'disputed').length
  const disputeRate = orders.length > 0 ? Math.round((disputedCount / orders.length) * 1000) / 10 : 0

  // ---- 近 6 月核对金额（按账单生成月份汇总应付） ----
  const months = lastNMonths(6)
  const monthly = months.map((m) => ({
    month: m,
    amount_cents: bills.filter((b) => monthOf(b.created_at) === m).reduce((s, b) => s + b.payable_total_cents, 0),
  }))

  // ---- 服务商金额占比（按工单 provider_name 汇总应付） ----
  const shareMap = new Map<string, number>()
  for (const b of bills) {
    const provider = orderMap.get(b.work_order_id)?.provider_name ?? '未知'
    shareMap.set(provider, (shareMap.get(provider) ?? 0) + b.payable_total_cents)
  }
  const providerShare = Array.from(shareMap.entries())
    .map(([provider_name, amount_cents]) => ({ provider_name, amount_cents }))
    .sort((a, b) => b.amount_cents - a.amount_cents)

  // ---- 待处理差异清单 ----
  const pendingItems = recons
    .filter(
      (r) =>
        (r.status === 'amount_diff' || r.status === 'contract_included' || r.status === 'unrecognized') &&
        !r.manual_note,
    )
    .map((r) => {
      const order = orderMap.get(r.work_order_id)
      const sub = r.submission_id != null ? subMap.get(r.submission_id) : null
      const amountCents =
        r.status === 'amount_diff' ? r.amount_diff_cents : (sub?.subtotal_cents ?? 0)
      return {
        work_order_id: r.work_order_id,
        jd_order_no: order?.jd_order_no ?? '',
        provider_name: order?.provider_name ?? '',
        item_name: sub?.item_name ?? '',
        amount_cents: amountCents,
        status: r.status,
      }
    })

  return json({
    kpis: {
      month_orders: monthOrders,
      pending_review: pendingReview,
      month_amount_cents: monthAmountCents,
      avg_reconcile_minutes: avgReconcileMinutes,
      dispute_rate: disputeRate,
    },
    monthly,
    provider_share: providerShare,
    pending_items: pendingItems,
  })
}
