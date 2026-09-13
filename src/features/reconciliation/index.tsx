import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ReconciliationItem, StandardFeeItem, WorkOrder } from '../../config/schema'
import { api, type EnrichedReconciliationItem, type ReconciliationList } from '../../shared/api'
import { centsToYuan, formatQuantity, formatSignedCents } from '../../shared/format'
import { RECONCILIATION_STATUS_META, reconciliationStatusMeta, workOrderStatusMeta } from '../../shared/status'

/** 是否属于「待处理异常」（与后端结算门控保持一致：异常状态且无 manual_note） */
function isPending(item: ReconciliationItem): boolean {
  return (
    (item.status === 'amount_diff' || item.status === 'contract_included' || item.status === 'unrecognized') &&
    !item.manual_note
  )
}

/** 标准金额：一致/金额差异 = 申报 - 差额；合同已含 = 0（全额核减）；合并/未识别无法确定 → null */
function standardAmountOf(item: EnrichedReconciliationItem): number | null {
  if (item.status === 'consistent' || item.status === 'amount_diff') {
    return (item.submission?.subtotal_cents ?? 0) - item.amount_diff_cents
  }
  if (item.status === 'contract_included') return 0
  return null
}

export default function ReconciliationPage() {
  const { id } = useParams()
  const workOrderId = Number(id)
  const valid = Number.isInteger(workOrderId) && workOrderId > 0

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null)
  const [data, setData] = useState<ReconciliationList | null>(null)
  const [standards, setStandards] = useState<StandardFeeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [matchForId, setMatchForId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [order, recon] = await Promise.all([
        api.getWorkOrder(workOrderId),
        api.listReconciliation(workOrderId),
      ])
      setWorkOrder(order.work_order)
      setData(recon)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [workOrderId])

  useEffect(() => {
    if (!valid) return
    void load()
    void api
      .listStandardItems()
      .then((r) => setStandards(r.items))
      .catch(() => {})
  }, [valid, load])

  const handleAction = useCallback(
    async (itemId: number, action: 'accept' | 'reject' | 'match', standardItemId?: number) => {
      setBusyId(itemId)
      setError(null)
      setSuccess(null)
      try {
        await api.handleReconciliationItem(itemId, { action, standard_item_id: standardItemId })
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : '操作失败')
      } finally {
        setBusyId(null)
        setMatchForId(null)
      }
    },
    [load],
  )

  const handleConfirm = useCallback(async () => {
    if (!data) return
    const unresolved = data.items.filter(isPending)
    if (unresolved.length > 0) {
      setError(`存在 ${unresolved.length} 项未处理异常，无法生成账单`)
      return
    }
    setBusyId(-1)
    setError(null)
    setSuccess(null)
    try {
      const { bill } = await api.createSettlement(workOrderId)
      setSuccess(
        `已生成账单 ${bill.bill_no}，应付 ¥${centsToYuan(bill.payable_total_cents)}，提交明细已锁定`,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成账单失败')
    } finally {
      setBusyId(null)
    }
  }, [data, workOrderId, load])

  if (!valid) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">缺少有效的工单 id，请从工单列表进入核对工作台。</p>
      </div>
    )
  }

  const items = data?.items ?? []
  const pendingItems = items.filter(isPending)
  const resolvedItems = items.filter((it) => !isPending(it))
  const summary = data?.summary
  const activeStandards = standards.filter((s) => s.is_active === 1)
  const confirming = busyId === -1

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* 面包屑 + 标题 */}
      <nav className="text-sm text-gray-500">
        <Link to="/orders" className="hover:text-blue-600">
          工单列表
        </Link>
        <span className="mx-2">›</span>
        <span className="text-gray-700">{workOrder?.jd_order_no ?? '…'}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-gray-900">费用核对工作台</h1>
        {workOrder && (
          <StatusBadge
            meta={workOrderStatusMeta(workOrder.status)}
            label={workOrderStatusMeta(workOrder.status).label}
          />
        )}
        <button
          onClick={() => {
            void api
              .generateReconciliation(workOrderId)
              .then(() => load())
              .catch((e) => setError(e instanceof Error ? e.message : '重新核对失败'))
          }}
          className="ml-auto rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          重新自动核对
        </button>
      </div>

      {workOrder && (
        <p className="mt-2 text-sm text-gray-500">
          服务商 {workOrder.provider_name} · {workOrder.address} · 安装完成 {workOrder.install_date}
        </p>
      )}

      {/* 提示条 */}
      {error && <div className="mt-4 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="mt-4 rounded bg-green-50 px-4 py-2 text-sm text-green-700">{success}</div>
      )}

      {loading && !data && (
        <div className="mt-12 text-center text-sm text-gray-400">加载中…</div>
      )}

      {data && (
        <>
          {/* 统计卡 */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="服务商申报总额" value={`¥${centsToYuan(summary?.claimed_total_cents)}`} />
            <StatCard label="系统核对通过" value={`¥${centsToYuan(summary?.system_total_cents)}`} tone="green" />
            <StatCard label="待处理差异" value={formatSignedCents(summary?.pending_diff_cents ?? 0)} tone="amber" />
            <StatCard label="待处理异常项" value={`${summary?.pending_count ?? 0} 项`} tone="red" />
          </div>

          {/* 图例 */}
          <div className="mt-6 flex flex-wrap gap-3">
            {Object.entries(RECONCILIATION_STATUS_META).map(([status, meta]) => (
              <span key={status} className="inline-flex items-center gap-1.5 text-xs" style={{ color: meta.text }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} />
                {meta.label}
              </span>
            ))}
          </div>

          {/* 需人工处理 */}
          <Section title={`需人工处理（${pendingItems.length}）`}>
            {pendingItems.length === 0 ? (
              <EmptyHint text="暂无待处理异常" />
            ) : (
              pendingItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  standards={activeStandards}
                  busy={busyId === item.id}
                  matchOpen={matchForId === item.id}
                  onAccept={() => handleAction(item.id, 'accept')}
                  onReject={() => handleAction(item.id, 'reject')}
                  onOpenMatch={() => setMatchForId(matchForId === item.id ? null : item.id)}
                  onMatch={(standardId) => handleAction(item.id, 'match', standardId)}
                />
              ))
            )}
          </Section>

          {/* 已处理（自动通过 + 人工处理） */}
          <Section title={`已处理（${resolvedItems.length}）`}>
            {resolvedItems.length === 0 ? (
              <EmptyHint text="暂无已处理明细" />
            ) : (
              resolvedItems.map((item) => (
                <ItemRow key={item.id} item={item} standards={[]} busy={false} matchOpen={false} />
              ))
            )}
          </Section>

          {/* 吸顶操作区 */}
          <div className="sticky bottom-0 mt-8 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-4 shadow">
            <p className="text-sm text-gray-500">
              {pendingItems.length > 0
                ? `仍有 ${pendingItems.length} 项异常未处理，处理完成后可生成账单`
                : '所有明细已处理，可生成结算账单并锁定提交明细'}
            </p>
            <button
              onClick={handleConfirm}
              disabled={pendingItems.length > 0 || confirming}
              className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {confirming ? '生成中…' : '确认核对完成'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---- 子组件 ----

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' | 'red' }) {
  const color =
    tone === 'green'
      ? '#1F7A3D'
      : tone === 'amber'
        ? '#92400E'
        : tone === 'red'
          ? '#B91C1C'
          : '#111827'
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white py-8 text-center text-sm text-gray-400">
      {text}
    </div>
  )
}

function StatusBadge({ meta, label }: { meta: { text: string; bg: string }; label: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
      style={{ color: meta.text, backgroundColor: meta.bg }}
    >
      {label}
    </span>
  )
}

interface ItemRowProps {
  item: EnrichedReconciliationItem
  standards: StandardFeeItem[]
  busy: boolean
  matchOpen: boolean
  onAccept?: () => void
  onReject?: () => void
  onOpenMatch?: () => void
  onMatch?: (standardId: number) => void
}

function ItemRow({
  item,
  standards,
  busy,
  matchOpen,
  onAccept,
  onReject,
  onOpenMatch,
  onMatch,
}: ItemRowProps) {
  const meta = reconciliationStatusMeta(item.status)
  const sub = item.submission
  const standardName = item.standard_item?.name ?? null
  const standardAmount = standardAmountOf(item)
  const isMerged = item.status === 'merged_consistent'

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" style={{ borderLeft: `4px solid ${meta.accent}` }}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 px-4 py-3">
        {/* 名称 + 数量 */}
        <div className="min-w-[200px] flex-1">
          <p className="text-sm font-medium text-gray-900">
            {sub?.item_name ?? '—'}
            {isMerged && <span className="ml-2 text-xs font-normal text-teal-600">（合并多条）</span>}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            数量 {formatQuantity(sub?.quantity)} · {meta.label}
          </p>
        </div>

        {/* 金额三列 */}
        <div className="grid grid-cols-3 gap-6 text-right">
          <Amount label="申报金额" value={`¥${centsToYuan(sub?.subtotal_cents)}`} />
          <Amount
            label="标准金额"
            value={standardAmount == null ? '—' : `¥${centsToYuan(standardAmount)}`}
          />
          <Amount
            label="差额"
            value={formatSignedCents(item.amount_diff_cents)}
            tone={item.amount_diff_cents !== 0 ? 'amber' : undefined}
          />
        </div>

        {/* 标准项 + 状态 */}
        <div className="flex flex-col items-end gap-2">
          <StatusBadge meta={meta} label={meta.label} />
          <p className="text-xs text-gray-400">
            标准项 {standardName ? `「${standardName}」` : '—'}
          </p>
          {item.manual_note && (
            <p className="text-xs text-gray-500">
              {item.handled_by ? `${item.handled_by} · ` : ''}
              {item.manual_note}
            </p>
          )}
        </div>
      </div>

      {/* 操作区（仅待处理且有动作时） */}
      {(onAccept || onReject || onOpenMatch) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-2.5">
          {item.status === 'amount_diff' && (
            <ActionButton onClick={onAccept!} disabled={busy}>
              接受差额
            </ActionButton>
          )}
          {item.status === 'unrecognized' && onOpenMatch && (
            <>
              {matchOpen ? (
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (v > 0) onMatch?.(v)
                  }}
                  disabled={busy}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                >
                  <option value="" disabled>
                    选择标准项…
                  </option>
                  {standards.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <ActionButton onClick={onOpenMatch} disabled={busy}>
                  手动匹配
                </ActionButton>
              )}
            </>
          )}
          <ActionButton onClick={onReject!} disabled={busy} danger>
            驳回
          </ActionButton>
          {busy && <span className="text-xs text-gray-400">处理中…</span>}
        </div>
      )}
    </div>
  )
}

function Amount({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm ${tone === 'amber' ? 'font-medium text-amber-700' : 'text-gray-700'}`}>
        {value}
      </p>
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50'
          : 'rounded border border-blue-200 px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50'
      }
    >
      {children}
    </button>
  )
}
