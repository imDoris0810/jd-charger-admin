/**
 * GET /api/submit/:token —— 服务商按 token 获取工单信息与标准费用项（只读，不消耗 token）
 * 对应 memory-bank/architecture.md 端点表。
 */
import type { Env } from '../lib/env'
import { json, notFound } from '../lib/http'
import type { StandardItemRow, WorkOrderRow } from '../lib/types'

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const token = Array.isArray(params.token) ? params.token[0] : params.token
  if (!token) return notFound('链接无效或已过期')

  const order = await env.DB
    .prepare('SELECT * FROM work_orders WHERE submit_token = ?')
    .bind(token)
    .first<WorkOrderRow>()
  if (!order) return notFound('链接无效或已过期')

  const stdRes = await env.DB
    .prepare('SELECT * FROM standard_fee_items WHERE is_active = 1 ORDER BY id')
    .all<StandardItemRow>()

  // 不返回 submit_token（已含于 URL），仅返回服务商可见的工单信息
  return json({
    work_order: {
      id: order.id,
      jd_order_no: order.jd_order_no,
      provider_name: order.provider_name,
      address: order.address,
      install_date: order.install_date,
      status: order.status,
    },
    standard_items: stdRes.results ?? [],
  })
}
