import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { SettlementBill, WorkOrder } from '../../config/schema'
import { api, type EnrichedReconciliationItem } from '../../shared/api'
import { centsToYuan, formatDateTime, formatQuantity } from '../../shared/format'
import { RECONCILIATION_STATUS_META } from '../../shared/status'

/** 是否核减：合同已含，或人工驳回（与 settlements.ts 核减逻辑一致） */
function isDeducted(it: EnrichedReconciliationItem): boolean {
  return it.status === 'contract_included' || (it.manual_note ?? '').includes('驳回')
}

/** 计费明细文案 */
function describeCharge(it: EnrichedReconciliationItem): string {
  const sub = it.submission
  const std = it.standard_item
  if (it.status === 'merged_consistent') return '合并多条明细'
  if (std?.calc_method === 'fixed') return '固定费用'
  if (std?.calc_method === 'per_meter') {
    return `${formatQuantity(sub?.quantity)} 米 × ${centsToYuan(std.unit_price_cents)} 元/米`
  }
  if (std?.calc_method === 'per_unit') {
    return `${formatQuantity(sub?.quantity)} 个 × ${centsToYuan(std.unit_price_cents)} 元/个`
  }
  return '据实填写'
}

export default function SettlementPage() {
  const { id } = useParams()
  const workOrderId = Number(id)
  const valid = Number.isInteger(workOrderId) && workOrderId > 0

  const [order, setOrder] = useState<WorkOrder | null>(null)
  const [bill, setBill] = useState<SettlementBill | null>(null)
  const [items, setItems] = useState<EnrichedReconciliationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!valid) {
      setError('缺少有效的工单 id')
      setLoading(false)
      return
    }
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const [o, r] = await Promise.all([
          api.getWorkOrder(workOrderId),
          api.listReconciliation(workOrderId),
        ])
        if (cancelled) return
        setOrder(o.work_order)
        setItems(r.items)
        // 账单可能尚未生成（404 → 显示「尚未生成账单」）
        try {
          const b = await api.getSettlement(workOrderId)
          if (!cancelled) setBill(b.bill)
        } catch {
          if (!cancelled) setBill(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [workOrderId, valid])

  useEffect(() => {
    if (toast == null) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">加载中…</div>
  }
  if (error || !order) {
    return <div className="p-8 text-sm text-red-600">{error ?? '工单不存在'}</div>
  }

  const billedItems = items.filter((it) => !isDeducted(it))
  const deductedItems = items.filter(isDeducted)

  const copyLink = async () => {
    const url = `${window.location.origin}/settlement/${workOrderId}`
    try {
      await navigator.clipboard.writeText(url)
      setToast('账单链接已复制')
    } catch {
      setToast(`账单链接：${url}`)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      {/* 面包屑 */}
      <nav className="text-sm text-gray-500">
        <Link to="/orders" className="hover:text-blue-600">
          工单列表
        </Link>
        <span className="mx-2">›</span>
        <span className="text-gray-700">结算账单</span>
      </nav>

      {/* 无账单态 */}
      {!bill ? (
        <div className="mt-12 rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-3xl">🧾</p>
          <h1 className="mt-3 text-lg font-semibold text-gray-900">该工单尚未生成账单</h1>
          <p className="mt-2 text-sm text-gray-500">请先在核对工作台处理完异常项并「确认核对完成」。</p>
          <Link
            to={`/reconciliation/${order.id}`}
            className="mt-5 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            进入核对工作台
          </Link>
        </div>
      ) : (
        <>
          {/* 账单头部 */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                结算账单 <span className="font-mono font-normal text-gray-400">{bill.bill_no}</span>
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                工单 {order.jd_order_no} · 生成于 {formatDateTime(bill.created_at)}
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={copyLink}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                复制链接
              </button>
              <button
                onClick={() => window.print()}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                导出 PDF
              </button>
            </div>
          </div>

          {/* 工单信息 */}
          <div className="mt-5 rounded-lg border border-gray-200 bg-white px-5 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              <KV label="工单号" value={order.jd_order_no} mono />
              <KV label="服务商" value={order.provider_name} />
              <KV label="安装完成日期" value={order.install_date} />
              <KV label="项目地址" value={order.address} span />
            </div>
          </div>

          {/* 金额汇总 */}
          <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3 text-sm font-medium text-gray-900">金额汇总</div>
            <div className="space-y-3 px-5 py-4">
              <SummaryRow label="服务商申报总额" value={`¥${centsToYuan(bill.claimed_total_cents)}`} />
              <SummaryRow
                label="核减金额"
                value={`−¥${centsToYuan(bill.deduction_cents)}`}
                tone="green"
              />
              <div className="border-t border-gray-100 pt-3">
                <SummaryRow label="最终应付金额" value={`¥${centsToYuan(bill.payable_total_cents)}`} bold />
              </div>
            </div>
          </div>

          {/* 费用明细 */}
          <Section title="费用明细">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">费用项</th>
                  <th className="px-4 py-2.5 font-medium">计费明细</th>
                  <th className="px-4 py-2.5 text-right font-medium">金额（元）</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {billedItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                      暂无计入明细
                    </td>
                  </tr>
                ) : (
                  billedItems.map((it) => (
                    <tr key={it.id}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {it.standard_item?.name ?? it.submission?.item_name ?? '—'}
                        {it.status === 'merged_consistent' && (
                          <span className="ml-1 text-xs font-normal text-teal-600">（合并）</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{describeCharge(it)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                        {it.status === 'merged_consistent'
                          ? '—'
                          : `¥${centsToYuan(it.submission?.subtotal_cents)}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Section>

          {/* 核减明细 */}
          {deductedItems.length > 0 && (
            <Section title="核减明细">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">费用项</th>
                    <th className="px-4 py-2.5 font-medium">核减原因</th>
                    <th className="px-4 py-2.5 text-right font-medium">核减金额（元）</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {deductedItems.map((it) => {
                    const meta = RECONCILIATION_STATUS_META[it.status]
                    const reason =
                      it.status === 'contract_included' ? '合同已含于基础安装' : (it.manual_note ?? '已驳回')
                    return (
                      <tr key={it.id}>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {it.submission?.item_name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs" style={{ color: meta.text }}>
                            {reason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-red-600">
                          −¥{centsToYuan(it.submission?.subtotal_cents)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {/* 调整记录 */}
          <Section title="调整记录">
            <div className="space-y-3 px-1 py-1">
              <TraceRow
                time={bill.created_at}
                actor="系统"
                text="确认核对完成，生成结算账单"
              />
              {items
                .filter((it) => it.manual_note)
                .map((it) => (
                  <TraceRow
                    key={it.id}
                    time={it.handled_at}
                    actor={it.handled_by ?? 'operator'}
                    text={
                      it.status === 'consistent' && it.manual_note === '接受差额'
                        ? `「${it.submission?.item_name ?? ''}」接受差额`
                        : `「${it.submission?.item_name ?? ''}」${it.manual_note ?? ''}`
                    }
                  />
                ))}
              <TraceRow
                time={items[0]?.created_at ?? bill.created_at}
                actor="系统"
                text="服务商提交费用明细，自动映射京东标准"
              />
            </div>
          </Section>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

// ---- 子组件 ----

function KV({ label, value, mono, span }: { label: string; value: string; mono?: boolean; span?: boolean }) {
  return (
    <div className={span ? 'sm:col-span-3' : ''}>
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`ml-2 text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string
  value: string
  tone?: 'green'
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span
        className={`tabular-nums ${bold ? 'text-xl font-semibold text-gray-900' : 'text-sm'} ${
          tone === 'green' ? 'text-green-600' : 'text-gray-800'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-3 text-sm font-medium text-gray-900">{title}</div>
      <div className="px-1 py-1">{children}</div>
    </div>
  )
}

function TraceRow({ time, actor, text }: { time: string | null; actor: string; text: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 whitespace-nowrap text-xs text-gray-400">{formatDateTime(time)}</span>
      <span className="whitespace-nowrap text-gray-600">{actor}</span>
      <span className="text-gray-700">{text}</span>
    </div>
  )
}
