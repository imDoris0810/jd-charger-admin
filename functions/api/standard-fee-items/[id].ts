/**
 * PATCH /api/standard-fee-items/:id —— 编辑 / 停用·启用标准费用项
 * 对应 memory-bank/architecture.md 端点表。停用为软停用（is_active=0），不物理删除。
 */
import type { Env } from '../lib/env'
import { badRequest, conflict, json, notFound, readJson } from '../lib/http'
import type { CalcMethod, StandardItemRow } from '../lib/types'

const CALC_METHODS: readonly CalcMethod[] = ['fixed', 'per_meter', 'per_unit', 'actual']

interface PatchInput {
  name?: string
  calc_method?: string
  unit_price_cents?: number | null
  included_in_base_fee?: number
  remark?: string | null
  is_active?: number
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, params, env }) => {
  const id = Number(Array.isArray(params.id) ? params.id[0] : params.id)
  if (!Number.isInteger(id) || id <= 0) return badRequest('无效的标准项 id')

  const body = await readJson<PatchInput>(request)
  if (!body) return badRequest('请求体需为 JSON')

  const existing = await env.DB
    .prepare('SELECT * FROM standard_fee_items WHERE id = ?')
    .bind(id)
    .first<StandardItemRow>()
  if (!existing) return notFound('标准费用项不存在')

  const sets: string[] = []
  const binds: unknown[] = []

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return badRequest('费用项名称不能为空')
    const dup = await env.DB
      .prepare('SELECT id FROM standard_fee_items WHERE name = ? AND id != ?')
      .bind(name, id)
      .first<{ id: number }>()
    if (dup) return conflict(`标准项「${name}」已存在`)
    sets.push('name = ?')
    binds.push(name)
  }

  if (body.calc_method !== undefined) {
    const cm = body.calc_method as CalcMethod
    if (!CALC_METHODS.includes(cm)) {
      return badRequest('calc_method 必须为 fixed / per_meter / per_unit / actual 之一')
    }
    sets.push('calc_method = ?')
    binds.push(cm)
  }

  if (body.unit_price_cents !== undefined) {
    const v = body.unit_price_cents == null ? null : Number(body.unit_price_cents)
    sets.push('unit_price_cents = ?')
    binds.push(v)
  }

  if (body.included_in_base_fee !== undefined) {
    sets.push('included_in_base_fee = ?')
    binds.push(body.included_in_base_fee ? 1 : 0)
  }

  if (body.remark !== undefined) {
    sets.push('remark = ?')
    binds.push(body.remark == null ? null : String(body.remark).trim() || null)
  }

  if (body.is_active !== undefined) {
    sets.push('is_active = ?')
    binds.push(body.is_active ? 1 : 0)
  }

  if (sets.length === 0) return badRequest('无更新字段')

  const now = new Date().toISOString()
  sets.push('updated_at = ?')
  binds.push(now)

  await env.DB
    .prepare(`UPDATE standard_fee_items SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds, id)
    .run()

  const updated = await env.DB
    .prepare('SELECT * FROM standard_fee_items WHERE id = ?')
    .bind(id)
    .first<StandardItemRow>()
  return json({ item: updated })
}
