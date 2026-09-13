import type { Env } from './lib/env'
import { badRequest, json, notFound, readJson } from './lib/http'
import { generateReconciliationItems, listReconciliationItems } from './lib/reconcile'

// GET /api/reconciliation-items?work_order_id= —— 查询核对明细
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const workOrderId = Number(url.searchParams.get('work_order_id'))
  if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
    return badRequest('缺少有效的 work_order_id 参数')
  }
  const result = await listReconciliationItems(env.DB, workOrderId)
  return json({ work_order_id: workOrderId, items: result.items, summary: result.summary })
}

// POST /api/reconciliation-items { work_order_id } —— 运行自动核对，生成五状态明细
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ work_order_id?: number }>(request)
  const workOrderId = Number(body?.work_order_id)
  if (!Number.isInteger(workOrderId) || workOrderId <= 0) {
    return badRequest('请求体需包含有效的 work_order_id')
  }

  const order = await env.DB
    .prepare('SELECT id FROM work_orders WHERE id = ?')
    .bind(workOrderId)
    .first<{ id: number }>()
  if (!order) return notFound('工单不存在')

  const result = await generateReconciliationItems(env.DB, workOrderId)
  return json({ work_order_id: workOrderId, items: result.items, summary: result.summary })
}
