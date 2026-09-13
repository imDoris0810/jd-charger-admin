/**
 * POST /api/reconciliation-items/:id —— 人工处理（接受差额 / 驳回 / 手动匹配）
 * 对应 docs/prd-f04.md 第 4 节状态流转。
 */
import type { Env } from '../lib/env'
import { badRequest, conflict, json, notFound, readJson } from '../lib/http'
import { calcStandardAmount } from '../lib/reconcile'
import type { ReconciliationRow, StandardItemRow, SubmissionRow } from '../lib/types'

type ManualAction = 'accept' | 'reject' | 'match'

interface ManualHandleInput {
  action?: string
  standard_item_id?: number
  note?: string
}

const ACTIONS: readonly ManualAction[] = ['accept', 'reject', 'match']

// Phase 3 尚未接入登录鉴权，操作人先写死为 operator
const HANDLED_BY = 'operator'

export const onRequestPost: PagesFunction<Env> = async ({ request, params, env }) => {
  const id = Number(Array.isArray(params.id) ? params.id[0] : params.id)
  if (!Number.isInteger(id) || id <= 0) return badRequest('无效的核对明细 id')

  const body = await readJson<ManualHandleInput>(request)
  if (!body) return badRequest('请求体需为 JSON')

  const action = body.action as ManualAction | undefined
  if (!action || !ACTIONS.includes(action)) {
    return badRequest('action 必须为 accept / reject / match 之一')
  }

  const item = await env.DB
    .prepare('SELECT * FROM reconciliation_items WHERE id = ?')
    .bind(id)
    .first<ReconciliationRow>()
  if (!item) return notFound('核对明细不存在')

  const now = new Date().toISOString()

  if (action === 'accept') {
    if (item.status !== 'amount_diff') return conflict('仅「金额差异」可接受差额')
    await env.DB
      .prepare('UPDATE reconciliation_items SET status = ?, manual_note = ?, handled_by = ?, handled_at = ? WHERE id = ?')
      .bind('consistent', '接受差额', HANDLED_BY, now, id)
      .run()
  } else if (action === 'reject') {
    if (!['amount_diff', 'contract_included', 'unrecognized'].includes(item.status)) {
      return conflict('该状态无需驳回')
    }
    const note = body.note?.trim() || (item.status === 'contract_included' ? '已驳回（合同已含）' : '已驳回')
    await env.DB
      .prepare('UPDATE reconciliation_items SET manual_note = ?, handled_by = ?, handled_at = ? WHERE id = ?')
      .bind(note, HANDLED_BY, now, id)
      .run()
  } else {
    // match：手动匹配到标准项（仅「未识别」）
    if (item.status !== 'unrecognized') return conflict('仅「未识别」可手动匹配')

    const standardItemId = body.standard_item_id
    if (!standardItemId || !Number.isInteger(standardItemId)) return badRequest('手动匹配需提供 standard_item_id')

    const standard = await env.DB
      .prepare('SELECT * FROM standard_fee_items WHERE id = ?')
      .bind(standardItemId)
      .first<StandardItemRow>()
    if (!standard) return notFound('标准费用项不存在')

    const sub = item.submission_id != null
      ? await env.DB.prepare('SELECT * FROM provider_submissions WHERE id = ?').bind(item.submission_id).first<SubmissionRow>()
      : null

    const standardAmount = calcStandardAmount(standard, sub?.quantity ?? null)
    if (standardAmount == null) {
      // 匹配到「其他增项(actual)」等无标准单价项：仍需人工接受/驳回，差额置 0
      await env.DB
        .prepare('UPDATE reconciliation_items SET standard_item_id = ?, amount_diff_cents = 0, status = ?, manual_note = NULL, handled_by = ?, handled_at = ? WHERE id = ?')
        .bind(standard.id, 'amount_diff', HANDLED_BY, now, id)
        .run()
    } else {
      const diff = (sub?.subtotal_cents ?? 0) - standardAmount
      const status = diff === 0 ? 'consistent' : 'amount_diff'
      // 匹配后若仍为金额差异，manual_note 留空，交由后续接受/驳回
      const note = diff === 0 ? `手动匹配到「${standard.name}」` : null
      await env.DB
        .prepare('UPDATE reconciliation_items SET standard_item_id = ?, amount_diff_cents = ?, status = ?, manual_note = ?, handled_by = ?, handled_at = ? WHERE id = ?')
        .bind(standard.id, diff, status, note, HANDLED_BY, now, id)
        .run()
    }
  }

  const updated = await env.DB
    .prepare('SELECT * FROM reconciliation_items WHERE id = ?')
    .bind(id)
    .first<ReconciliationRow>()
  return json({ item: updated })
}
