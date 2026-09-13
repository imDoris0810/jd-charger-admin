import type { Env } from './lib/env'
import { badRequest, conflict, json, readJson } from './lib/http'
import type { CalcMethod, StandardItemRow } from './lib/types'

const CALC_METHODS: readonly CalcMethod[] = ['fixed', 'per_meter', 'per_unit', 'actual']

interface StandardItemInput {
  name?: string
  calc_method?: string
  unit_price_cents?: number | null
  included_in_base_fee?: number
  remark?: string | null
}

// GET /api/standard-fee-items —— 标准费用库列表
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const res = await env.DB.prepare('SELECT * FROM standard_fee_items ORDER BY id').all<StandardItemRow>()
  return json({ items: res.results ?? [] })
}

// POST /api/standard-fee-items —— 新增标准费用项
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<StandardItemInput>(request)
  if (!body) return badRequest('请求体需为 JSON')

  const name = body.name?.trim()
  if (!name) return badRequest('费用项名称不能为空')

  const calcMethod = body.calc_method as CalcMethod | undefined
  if (!calcMethod || !CALC_METHODS.includes(calcMethod)) {
    return badRequest('calc_method 必须为 fixed / per_meter / per_unit / actual 之一')
  }

  const existing = await env.DB
    .prepare('SELECT id FROM standard_fee_items WHERE name = ?')
    .bind(name)
    .first<{ id: number }>()
  if (existing) return conflict(`标准项「${name}」已存在`)

  const unitPriceCents = body.unit_price_cents == null ? null : Number(body.unit_price_cents)
  const includedInBaseFee = body.included_in_base_fee ? 1 : 0
  const remark = body.remark?.trim() || null

  const now = new Date().toISOString()
  const res = await env.DB
    .prepare(
      'INSERT INTO standard_fee_items (name, calc_method, unit_price_cents, included_in_base_fee, is_active, remark, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    )
    .bind(name, calcMethod, unitPriceCents, includedInBaseFee, remark, now, now)
    .run()

  const item: StandardItemRow = {
    id: res.meta.last_row_id,
    name,
    calc_method: calcMethod,
    unit_price_cents: unitPriceCents,
    included_in_base_fee: includedInBaseFee,
    is_active: 1,
    remark,
    created_at: now,
    updated_at: now,
  }
  return json({ item }, 201)
}
