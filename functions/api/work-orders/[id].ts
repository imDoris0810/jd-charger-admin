import type { Env } from '../lib/env'
import { badRequest, json, notFound } from '../lib/http'
import type { WorkOrderRow } from '../lib/types'

// GET /api/work-orders/:id —— 工单详情
export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const id = Number(Array.isArray(params.id) ? params.id[0] : params.id)
  if (!Number.isInteger(id) || id <= 0) return badRequest('无效的工单 id')

  const order = await env.DB.prepare('SELECT * FROM work_orders WHERE id = ?').bind(id).first<WorkOrderRow>()
  if (!order) return notFound('工单不存在')
  return json({ work_order: order })
}
