import type { Env } from './lib/env'
import { badRequest, conflict, json, notFound, readJson } from './lib/http'
import { generateBillNo } from './lib/token'
import type { ReconciliationRow, SettlementBillRow, SubmissionRow, WorkOrderRow } from './lib/types'

// GET /api/settlements?work_order_id= —— 查询工单账单
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const workOrderId = Number(url.searchParams.get('work_order_id'))
  if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
    return badRequest('缺少有效的 work_order_id 参数')
  }
  const bill = await env.DB
    .prepare('SELECT * FROM settlement_bills WHERE work_order_id = ?')
    .bind(workOrderId)
    .first<SettlementBillRow>()
  if (!bill) return notFound('该工单尚未生成账单')
  return json({ bill })
}

// POST /api/settlements { work_order_id } —— 生成结算账单并锁定提交明细
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ work_order_id?: number }>(request)
  const workOrderId = Number(body?.work_order_id)
  if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
    return badRequest('请求体需包含有效的 work_order_id')
  }

  const order = await env.DB
    .prepare('SELECT * FROM work_orders WHERE id = ?')
    .bind(workOrderId)
    .first<WorkOrderRow>()
  if (!order) return notFound('工单不存在')

  const existing = await env.DB
    .prepare('SELECT id FROM settlement_bills WHERE work_order_id = ?')
    .bind(workOrderId)
    .first<{ id: number }>()
  if (existing) return conflict('该工单已生成账单')

  const subsRes = await env.DB
    .prepare('SELECT * FROM provider_submissions WHERE work_order_id = ?')
    .bind(workOrderId)
    .all<SubmissionRow>()
  const submissions = subsRes.results ?? []
  const claimedTotal = submissions.reduce((sum, s) => sum + s.subtotal_cents, 0)

  const reconRes = await env.DB
    .prepare('SELECT * FROM reconciliation_items WHERE work_order_id = ?')
    .bind(workOrderId)
    .all<ReconciliationRow>()
  const recons = reconRes.results ?? []

  // 门控：存在未处理异常项（amount_diff / contract_included / unrecognized 且无 manual_note）则拒绝生成
  const unresolved = recons.filter(
    (r) =>
      (r.status === 'amount_diff' || r.status === 'contract_included' || r.status === 'unrecognized') &&
      !r.manual_note,
  )
  if (unresolved.length > 0) {
    return conflict(`存在 ${unresolved.length} 项未处理异常，无法生成账单`)
  }

  // 核减 = 合同已含（全额核减）+ 被驳回明细（manual_note 含「驳回」）
  const deductionCents = recons.reduce((sum, r) => {
    const rejected = r.status === 'contract_included' || (r.manual_note ?? '').includes('驳回')
    if (!rejected) return sum
    const sub = submissions.find((s) => s.id === r.submission_id)
    return sum + (sub ? sub.subtotal_cents : 0)
  }, 0)

  const payableCents = claimedTotal - deductionCents
  const billNo = generateBillNo(workOrderId)
  const now = new Date().toISOString()

  const res = await env.DB
    .prepare(
      'INSERT INTO settlement_bills (work_order_id, bill_no, claimed_total_cents, deduction_cents, payable_total_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(workOrderId, billNo, claimedTotal, deductionCents, payableCents, 'issued', now)
    .run()

  // 锁定提交明细 + 工单转已核对
  await env.DB.prepare('UPDATE provider_submissions SET is_locked = 1 WHERE work_order_id = ?').bind(workOrderId).run()
  await env.DB
    .prepare('UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?')
    .bind('reviewed', now, workOrderId)
    .run()

  const bill: SettlementBillRow = {
    id: res.meta.last_row_id,
    work_order_id: workOrderId,
    bill_no: billNo,
    claimed_total_cents: claimedTotal,
    deduction_cents: deductionCents,
    payable_total_cents: payableCents,
    status: 'issued',
    pdf_url: null,
    created_at: now,
  }
  return json({ bill }, 201)
}
