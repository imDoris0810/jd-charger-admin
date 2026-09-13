/**
 * 自动核对算法（对应 docs/prd-f04.md 第 2 节）
 *
 * 对工单下每条未锁定的 provider_submissions 依次判定，生成五种状态的
 * reconciliation_items：
 *   1. 名称精确匹配标准项 → 金额比对 → consistent / amount_diff
 *   2. 命中「已含费用」关键词 → contract_included
 *   3. 命中「合并映射」关键词 → 多条聚合 → merged_consistent / amount_diff
 *   4. 其余 → unrecognized
 */
import { matchIncludedRule, matchMergeRule } from './matcher'
import type {
  ReconciliationRow,
  ReconciliationStatus,
  StandardItemRow,
  SubmissionRow,
} from './types'

/** 待写入的核对明细（尚无 id / created_at） */
interface PendingItem {
  work_order_id: number
  submission_id: number | null
  standard_item_id: number | null
  amount_diff_cents: number
  status: ReconciliationStatus
}

/** 按计算方式得出标准金额（分）；无法计算（如 actual）返回 null */
export function calcStandardAmount(standard: StandardItemRow, quantity: number | null): number | null {
  if (standard.calc_method === 'fixed') return standard.unit_price_cents
  if (standard.calc_method === 'per_meter' || standard.calc_method === 'per_unit') {
    if (quantity == null || standard.unit_price_cents == null) return null
    return Math.round(quantity * standard.unit_price_cents)
  }
  // 'actual'：据实填写，无标准单价，不参与自动金额比对
  return null
}

/** 组内数量一致才可确定「合并数量」（假定同组明细覆盖同一工程量，如材料+安装均为 8 米） */
function resolveMergedQuantity(group: SubmissionRow[]): number | null {
  const quantities = group.map((s) => s.quantity).filter((q): q is number => q != null)
  if (quantities.length === 0) return null
  const first = quantities[0]
  return quantities.every((q) => q === first) ? first : null
}

async function loadActiveStandards(db: D1Database): Promise<StandardItemRow[]> {
  const res = await db
    .prepare('SELECT * FROM standard_fee_items WHERE is_active = 1 ORDER BY id')
    .all<StandardItemRow>()
  return res.results ?? []
}

async function loadUnlockedSubmissions(db: D1Database, workOrderId: number): Promise<SubmissionRow[]> {
  const res = await db
    .prepare('SELECT * FROM provider_submissions WHERE work_order_id = ? AND is_locked = 0 ORDER BY id')
    .bind(workOrderId)
    .all<SubmissionRow>()
  return res.results ?? []
}

/**
 * 生成（重算）某工单的核对明细，返回生成的五状态明细（幂等）。
 * Phase 2 尚无人工处理，直接清空重算；Phase 3 接入人工处理后需保留 manual_note。
 */
export async function generateReconciliationItems(
  db: D1Database,
  workOrderId: number,
): Promise<ReconciliationListResult> {
  const standards = await loadActiveStandards(db)
  const submissions = await loadUnlockedSubmissions(db, workOrderId)

  await db.prepare('DELETE FROM reconciliation_items WHERE work_order_id = ?').bind(workOrderId).run()

  if (submissions.length === 0) return { items: [], summary: buildSummary(workOrderId, [], []) }

  const byName = new Map(standards.map((s) => [s.name, s]))
  const pending: PendingItem[] = []
  const mergeGroups = new Map<string, SubmissionRow[]>()

  for (const sub of submissions) {
    // 1) 名称精确匹配标准项
    const exact = byName.get(sub.item_name)
    if (exact) {
      const standardAmount = calcStandardAmount(exact, sub.quantity)
      if (standardAmount == null) {
        // 精确命中「其他增项(actual)」等无标准单价项 → 据实填写需审批 → 未识别
        pending.push({
          work_order_id: workOrderId,
          submission_id: sub.id,
          standard_item_id: null,
          amount_diff_cents: 0,
          status: 'unrecognized',
        })
        continue
      }
      const diff = sub.subtotal_cents - standardAmount
      pending.push({
        work_order_id: workOrderId,
        submission_id: sub.id,
        standard_item_id: exact.id,
        amount_diff_cents: diff,
        status: diff === 0 ? 'consistent' : 'amount_diff',
      })
      continue
    }

    // 2) 已含费用（合同已含）
    const included = matchIncludedRule(sub.item_name)
    if (included) {
      const standard = byName.get(included.standardName)
      // 仅当对应标准项确实 included_in_base_fee = 1 时判定（设计决策 D5）
      if (standard && standard.included_in_base_fee === 1) {
        pending.push({
          work_order_id: workOrderId,
          submission_id: sub.id,
          standard_item_id: standard.id,
          amount_diff_cents: sub.subtotal_cents,
          status: 'contract_included',
        })
        continue
      }
    }

    // 3) 合并映射（多条明细聚合到同一标准项）
    const merge = matchMergeRule(sub.item_name)
    if (merge) {
      const target = byName.get(merge.target)
      if (target && (target.calc_method === 'per_meter' || target.calc_method === 'per_unit')) {
        const group = mergeGroups.get(target.name) ?? []
        group.push(sub)
        mergeGroups.set(target.name, group)
        continue
      }
    }

    // 4) 未识别
    pending.push({
      work_order_id: workOrderId,
      submission_id: sub.id,
      standard_item_id: null,
      amount_diff_cents: 0,
      status: 'unrecognized',
    })
  }

  // 处理合并分组：>= 2 条才算「合并一致」；单条回落为未识别
  for (const [targetName, group] of mergeGroups) {
    if (group.length < 2) {
      for (const sub of group) {
        pending.push({
          work_order_id: workOrderId,
          submission_id: sub.id,
          standard_item_id: null,
          amount_diff_cents: 0,
          status: 'unrecognized',
        })
      }
      continue
    }

    const target = byName.get(targetName)
    if (!target || target.unit_price_cents == null) {
      pending.push({
        work_order_id: workOrderId,
        submission_id: group[0].id,
        standard_item_id: null,
        amount_diff_cents: 0,
        status: 'unrecognized',
      })
      continue
    }

    const mergedSubtotal = group.reduce((sum, s) => sum + s.subtotal_cents, 0)
    const mergedQuantity = resolveMergedQuantity(group)
    if (mergedQuantity == null) {
      // 组内数量不一致，无法自动确定标准金额 → 整体未识别，交人工
      pending.push({
        work_order_id: workOrderId,
        submission_id: group[0].id,
        standard_item_id: null,
        amount_diff_cents: 0,
        status: 'unrecognized',
      })
      continue
    }

    const standardAmount = Math.round(mergedQuantity * target.unit_price_cents)
    const diff = mergedSubtotal - standardAmount
    pending.push({
      work_order_id: workOrderId,
      submission_id: group[0].id,
      standard_item_id: target.id,
      amount_diff_cents: diff,
      status: diff === 0 ? 'merged_consistent' : 'amount_diff',
    })
  }

  const insert = db.prepare(
    'INSERT INTO reconciliation_items (work_order_id, submission_id, standard_item_id, amount_diff_cents, status) VALUES (?, ?, ?, ?, ?)',
  )
  for (const p of pending) {
    await insert.bind(p.work_order_id, p.submission_id, p.standard_item_id, p.amount_diff_cents, p.status).run()
  }

  return listReconciliationItems(db, workOrderId)
}

export interface EnrichedReconciliationItem extends ReconciliationRow {
  submission: SubmissionRow | null
  standard_item: StandardItemRow | null
}

export interface ReconciliationSummary {
  work_order_id: number
  /** 服务商申报总额（分） */
  claimed_total_cents: number
  /** 系统核对通过总额（分） */
  system_total_cents: number
  /** 待处理异常项数 */
  pending_count: number
  /** 待处理差异合计（分） */
  pending_diff_cents: number
}

export interface ReconciliationListResult {
  items: EnrichedReconciliationItem[]
  summary: ReconciliationSummary
}

function buildSummary(
  workOrderId: number,
  submissions: SubmissionRow[],
  items: ReconciliationRow[],
): ReconciliationSummary {
  const claimedTotal = submissions.reduce((sum, s) => sum + s.subtotal_cents, 0)
  let pendingCount = 0
  let pendingDiff = 0
  for (const it of items) {
    const pending =
      ['amount_diff', 'contract_included', 'unrecognized'].includes(it.status) && !it.manual_note
    if (!pending) continue
    pendingCount++
    const sub = submissions.find((s) => s.id === it.submission_id)
    pendingDiff += it.status === 'amount_diff' ? it.amount_diff_cents : sub ? sub.subtotal_cents : 0
  }
  return {
    work_order_id: workOrderId,
    claimed_total_cents: claimedTotal,
    system_total_cents: claimedTotal - pendingDiff,
    pending_count: pendingCount,
    pending_diff_cents: pendingDiff,
  }
}

/** 查询某工单核对明细，并附带关联的提交明细与标准项（供前端直接展示） */
export async function listReconciliationItems(
  db: D1Database,
  workOrderId: number,
): Promise<ReconciliationListResult> {
  const itemsRes = await db
    .prepare('SELECT * FROM reconciliation_items WHERE work_order_id = ? ORDER BY id')
    .bind(workOrderId)
    .all<ReconciliationRow>()
  const items = itemsRes.results ?? []

  const subsRes = await db
    .prepare('SELECT * FROM provider_submissions WHERE work_order_id = ?')
    .bind(workOrderId)
    .all<SubmissionRow>()
  const submissions = subsRes.results ?? []

  const summary = buildSummary(workOrderId, submissions, items)
  if (items.length === 0) return { items: [], summary }

  const stdRes = await db.prepare('SELECT * FROM standard_fee_items').all<StandardItemRow>()
  const subMap = new Map(submissions.map((s) => [s.id, s]))
  const stdMap = new Map((stdRes.results ?? []).map((s) => [s.id, s]))

  const enriched = items.map((it) => ({
    ...it,
    submission: it.submission_id != null ? (subMap.get(it.submission_id) ?? null) : null,
    standard_item: it.standard_item_id != null ? (stdMap.get(it.standard_item_id) ?? null) : null,
  }))

  return { items: enriched, summary }
}
