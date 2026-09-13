import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type DashboardSummary } from '../../shared/api'
import { centsToYuan, formatSignedCents } from '../../shared/format'
import { RECONCILIATION_STATUS_META } from '../../shared/status'

function monthLabel(ym: string): string {
  const m = Number(ym.split('-')[1])
  return `${m}月`
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">加载中…</div>
  }
  if (error || !data) {
    return <div className="p-8 text-sm text-red-600">{error ?? '加载失败'}</div>
  }

  const { kpis, monthly, provider_share: share, pending_items: pending } = data
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.amount_cents))
  const maxShare = Math.max(1, ...share.map((s) => s.amount_cents))
  const totalShare = share.reduce((sum, s) => sum + s.amount_cents, 0)

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <h1 className="text-xl font-semibold text-gray-900">数据看板</h1>

      {/* KPI 卡 */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="本月工单" value={String(kpis.month_orders)} />
        <Kpi label="待核对" value={String(kpis.pending_review)} />
        <Kpi label="本月核对金额" value={`¥${centsToYuan(kpis.month_amount_cents)}`} />
        <Kpi
          label="平均核对耗时"
          value={kpis.avg_reconcile_minutes == null ? '—' : `${kpis.avg_reconcile_minutes} 分钟`}
        />
        <Kpi label="争议率" value={`${kpis.dispute_rate}%`} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* 近 6 月金额柱状图 */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900">近 6 个月核对金额</h2>
          <p className="mt-0.5 text-xs text-gray-400">单位：元 · 按账单生成月份汇总应付</p>
          <div className="mt-5 flex items-end justify-between gap-3" style={{ height: 180 }}>
            {monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs text-gray-500">{centsToYuan(m.amount_cents)}</span>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-400"
                  style={{ height: `${Math.max(4, Math.round((m.amount_cents / maxMonthly) * 120))}px` }}
                />
                <span className="text-xs text-gray-400">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 服务商占比横条 */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-900">服务商金额占比</h2>
          <p className="mt-0.5 text-xs text-gray-400">按已结算账单应付金额汇总</p>
          <div className="mt-5 space-y-4">
            {share.length === 0 ? (
              <p className="text-sm text-gray-400">暂无已结算数据</p>
            ) : (
              share.map((s) => (
                <div key={s.provider_name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{s.provider_name}</span>
                    <span className="tabular-nums text-gray-500">
                      ¥{centsToYuan(s.amount_cents)}
                      <span className="ml-2 text-xs text-gray-400">
                        {totalShare > 0 ? Math.round((s.amount_cents / totalShare) * 100) : 0}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded bg-gray-100">
                    <div
                      className="h-full rounded bg-teal-500"
                      style={{ width: `${Math.max(2, Math.round((s.amount_cents / maxShare) * 100))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 待处理差异表 */}
      <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3 text-sm font-medium text-gray-900">
          待处理差异（{pending.length}）
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">工单号</th>
              <th className="px-4 py-2.5 font-medium">服务商</th>
              <th className="px-4 py-2.5 font-medium">差异项</th>
              <th className="px-4 py-2.5 text-right font-medium">金额</th>
              <th className="px-4 py-2.5 font-medium">状态</th>
              <th className="px-4 py-2.5 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pending.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  暂无待处理差异
                </td>
              </tr>
            ) : (
              pending.map((p) => {
                const meta = RECONCILIATION_STATUS_META[p.status]
                return (
                  <tr key={`${p.work_order_id}-${p.item_name}-${p.status}`} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-gray-800">{p.jd_order_no}</td>
                    <td className="px-4 py-3 text-gray-700">{p.provider_name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.item_name || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                      {p.status === 'amount_diff'
                        ? formatSignedCents(p.amount_cents)
                        : `¥${centsToYuan(p.amount_cents)}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs" style={{ color: meta.text }}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/reconciliation/${p.work_order_id}`}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        进入核对
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}
