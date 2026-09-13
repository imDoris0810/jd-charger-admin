import type { Env } from './lib/env'
import { badRequest, conflict, json, notFound, readJson } from './lib/http'
import { generateReconciliationItems } from './lib/reconcile'
import type { WorkOrderRow } from './lib/types'

interface SubmissionItemInput {
  item_name?: string
  quantity?: number | null
  unit_price_cents?: number | null
  subtotal_cents?: number | null
}

interface SubmissionInput {
  token?: string
  items?: SubmissionItemInput[]
}

// POST /api/submissions —— 服务商凭 token 提交费用明细（token 一次性有效）
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<SubmissionInput>(request)
  if (!body) return badRequest('请求体需为 JSON')

  const token = body.token?.trim()
  if (!token) return badRequest('缺少 token')

  const items = body.items
  if (!Array.isArray(items) || items.length === 0) return badRequest('items 不能为空')

  const order = await env.DB
    .prepare('SELECT * FROM work_orders WHERE submit_token = ?')
    .bind(token)
    .first<WorkOrderRow>()
  if (!order) return notFound('链接无效或已过期')
  if (order.status !== 'pending_submit') return conflict('已提交，等待核对（提交链接一次性有效）')

  // 校验并规范化每条明细
  const rows: { item_name: string; quantity: number | null; unit_price_cents: number | null; subtotal_cents: number }[] = []
  for (const it of items) {
    const item_name = it?.item_name?.trim()
    if (!item_name) return badRequest('每条明细需填写费用项名称')

    const quantity = it.quantity == null ? null : Number(it.quantity)
    const unit_price_cents = it.unit_price_cents == null ? null : Number(it.unit_price_cents)
    let subtotal_cents = it.subtotal_cents == null ? null : Number(it.subtotal_cents)

    // 未显式给小计则按 数量 × 单价 计算
    if (subtotal_cents == null && quantity != null && unit_price_cents != null) {
      subtotal_cents = Math.round(quantity * unit_price_cents)
    }
    if (subtotal_cents == null || !Number.isFinite(subtotal_cents)) {
      return badRequest(`明细「${item_name}」缺少金额（subtotal_cents）`)
    }
    if (subtotal_cents < 0) return badRequest(`明细「${item_name}」金额不能为负`)

    rows.push({ item_name, quantity, unit_price_cents, subtotal_cents })
  }

  const now = new Date().toISOString()
  const stmt = env.DB.prepare(
    'INSERT INTO provider_submissions (work_order_id, item_name, quantity, unit_price_cents, subtotal_cents, submitted_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  for (const r of rows) {
    await stmt.bind(order.id, r.item_name, r.quantity, r.unit_price_cents, r.subtotal_cents, now).run()
  }

  // 工单转待核对
  await env.DB
    .prepare('UPDATE work_orders SET status = ?, updated_at = ? WHERE id = ?')
    .bind('pending_review', now, order.id)
    .run()

  // 提交后自动核对，生成五状态明细
  await generateReconciliationItems(env.DB, order.id)

  return json({ ok: true, work_order_id: order.id, submitted_count: rows.length }, 201)
}
