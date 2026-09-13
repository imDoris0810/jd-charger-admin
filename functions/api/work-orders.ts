import type { Env } from './lib/env'
import { badRequest, conflict, json, readJson } from './lib/http'
import { generateToken } from './lib/token'
import type { WorkOrderRow } from './lib/types'

interface WorkOrderInput {
  jd_order_no?: string
  provider_name?: string
  address?: string
  install_date?: string
}

// GET /api/work-orders?status=&q= —— 工单列表（筛选 / 模糊搜索）
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const status = url.searchParams.get('status')?.trim()
  const q = url.searchParams.get('q')?.trim()

  const where: string[] = []
  const binds: unknown[] = []
  if (status) {
    where.push('status = ?')
    binds.push(status)
  }
  if (q) {
    where.push('(jd_order_no LIKE ? OR provider_name LIKE ?)')
    binds.push(`%${q}%`, `%${q}%`)
  }

  let sql = 'SELECT * FROM work_orders'
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY created_at DESC, id DESC'

  const res = await env.DB.prepare(sql).bind(...binds).all<WorkOrderRow>()
  return json({ work_orders: res.results ?? [] })
}

// POST /api/work-orders —— 发起核对：创建工单并生成 submit_token
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<WorkOrderInput>(request)
  if (!body) return badRequest('请求体需为 JSON')

  const jd_order_no = body.jd_order_no?.trim()
  const provider_name = body.provider_name?.trim()
  const address = body.address?.trim()
  const install_date = body.install_date?.trim()

  if (!jd_order_no || !provider_name || !address || !install_date) {
    return badRequest('京东工单号 / 服务商名称 / 项目地址 / 安装完成日期 均为必填')
  }

  const existing = await env.DB
    .prepare('SELECT id FROM work_orders WHERE jd_order_no = ?')
    .bind(jd_order_no)
    .first<{ id: number }>()
  if (existing) return conflict(`京东工单号 ${jd_order_no} 已存在`)

  const token = generateToken()
  const now = new Date().toISOString()
  const res = await env.DB
    .prepare(
      'INSERT INTO work_orders (jd_order_no, provider_name, address, install_date, status, submit_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(jd_order_no, provider_name, address, install_date, 'pending_submit', token, now, now)
    .run()

  const workOrder: WorkOrderRow = {
    id: res.meta.last_row_id,
    jd_order_no,
    provider_name,
    address,
    install_date,
    status: 'pending_submit',
    submit_token: token,
    created_at: now,
    updated_at: now,
  }
  return json({ work_order: workOrder }, 201)
}
