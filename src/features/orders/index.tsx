import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { WorkOrder, WorkOrderStatus } from '../../config/schema'
import { api } from '../../shared/api'
import { workOrderStatusMeta } from '../../shared/status'

const PAGE_SIZE = 20

const PROVIDER_SUGGESTIONS = ['城南安装', '远程机电', '安家安装', '其他']

const TABS: { key: '' | WorkOrderStatus; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'pending_submit', label: '待提交' },
  { key: 'pending_review', label: '待核对' },
  { key: 'reviewed', label: '已核对' },
  { key: 'settled', label: '已结算' },
  { key: 'disputed', label: '争议中' },
]

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function daysSince(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

/** 待办卡对应的筛选条件：'overdue' 为「待提交且超 3 天」的派生筛选 */
type Filter = '' | WorkOrderStatus | 'overdue'

export default function OrdersPage() {
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [toast, setToast] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.listWorkOrders()
      setOrders(r.work_orders)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (toast == null) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // 待办卡计数（与列表实时一致）
  const counts = useMemo(() => {
    let pendingReview = 0
    let disputed = 0
    let overdue = 0
    for (const o of orders) {
      if (o.status === 'pending_review') pendingReview++
      else if (o.status === 'disputed') disputed++
      if (o.status === 'pending_submit' && daysSince(o.created_at) > 3) overdue++
    }
    return { pendingReview, disputed, overdue }
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter === 'overdue') {
        if (o.status !== 'pending_submit' || daysSince(o.created_at) <= 3) return false
      } else if (filter !== '') {
        if (o.status !== filter) return false
      }
      if (q) {
        if (!o.jd_order_no.toLowerCase().includes(q) && !o.provider_name.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })
  }, [orders, filter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const selectFilter = (f: Filter) => {
    setFilter(f)
    setPage(1)
  }

  const copyLink = async (order: WorkOrder) => {
    if (!order.submit_token) return
    const url = `${window.location.origin}/submit/${order.submit_token}`
    try {
      await navigator.clipboard.writeText(url)
      setToast('链接已复制，请发送给服务商')
    } catch {
      setToast(`提交链接：${url}`)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">工单列表</h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 发起核对
        </button>
      </div>

      {/* 待办卡 */}
      <div className="mt-5 grid grid-cols-3 gap-4">
        <TodoCard
          label="待核对"
          value={counts.pendingReview}
          color="#B45309"
          onClick={() => selectFilter('pending_review')}
        />
        <TodoCard
          label="争议中"
          value={counts.disputed}
          color="#E74242"
          onClick={() => selectFilter('disputed')}
        />
        <TodoCard
          label="超 3 天未提交"
          value={counts.overdue}
          color="#4B5563"
          onClick={() => selectFilter('overdue')}
        />
      </div>

      {/* 筛选 Tab + 搜索 */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
          {TABS.map((t) => {
            const active = filter === t.key
            const count =
              t.key === ''
                ? orders.length
                : orders.filter((o) => o.status === t.key).length
            return (
              <button
                key={t.key || 'all'}
                onClick={() => selectFilter(t.key)}
                className={`rounded px-3 py-1.5 text-sm ${
                  active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className="ml-1 text-xs text-gray-400">{count}</span>
              </button>
            )
          })}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="搜索工单号 / 服务商名称…"
          className="ml-auto w-64 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {/* 列表 */}
      {loading && orders.length === 0 ? (
        <div className="mt-12 text-center text-sm text-gray-400">加载中…</div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">工单号</th>
                <th className="px-4 py-3 font-medium">服务商</th>
                <th className="px-4 py-3 font-medium">项目地址</th>
                <th className="px-4 py-3 font-medium">安装完成日期</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    暂无工单
                  </td>
                </tr>
              ) : (
                paged.map((o) => (
                  <Row key={o.id} order={o} onCopy={() => copyLink(o)} />
                ))
              )}
            </tbody>
          </table>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
              <span>
                共 {filtered.length} 条 · 第 {currentPage} / {totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {showModal && (
        <CreateOrderModal
          onClose={() => setShowModal(false)}
          onCreated={(order) => {
            setOrders((prev) => [order, ...prev])
            setFilter('')
            setPage(1)
            setToast('工单已创建，可复制提交链接')
          }}
        />
      )}
    </div>
  )
}

// ---- 子组件 ----

function TodoCard({ label, value, color, onClick }: { label: string; value: number; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-gray-200 bg-white px-5 py-4 text-left hover:border-gray-300"
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color }}>
        {value}
      </p>
    </button>
  )
}

function Row({ order, onCopy }: { order: WorkOrder; onCopy: () => void }) {
  const meta = workOrderStatusMeta(order.status)
  return (
    <tr className="hover:bg-gray-50/60">
      <td className="px-4 py-3 font-mono text-gray-800">{order.jd_order_no}</td>
      <td className="px-4 py-3 text-gray-700">{order.provider_name}</td>
      <td className="px-4 py-3 text-gray-500">{order.address}</td>
      <td className="px-4 py-3 text-gray-500">{order.install_date}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-gray-700">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} />
          {meta.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {order.status === 'pending_submit' && (
          <button onClick={onCopy} className="text-sm text-blue-600 hover:text-blue-700">
            复制提交链接
          </button>
        )}
        {(order.status === 'pending_review' || order.status === 'disputed') && (
          <Link to={`/reconciliation/${order.id}`} className="text-sm text-blue-600 hover:text-blue-700">
            进入核对
          </Link>
        )}
        {(order.status === 'reviewed' || order.status === 'settled') && (
          <Link to={`/settlement/${order.id}`} className="text-sm text-blue-600 hover:text-blue-700">
            查看账单
          </Link>
        )}
      </td>
    </tr>
  )
}

function CreateOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (order: WorkOrder) => void
}) {
  const [form, setForm] = useState({
    jd_order_no: '',
    provider_name: '',
    address: '',
    install_date: todayISO(),
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    const jd_order_no = form.jd_order_no.trim()
    const provider_name = form.provider_name.trim()
    const address = form.address.trim()
    const install_date = form.install_date.trim()
    if (!jd_order_no || !provider_name || !address || !install_date) {
      setError('京东工单号 / 服务商名称 / 项目地址 / 安装完成日期 均为必填')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const r = await api.createWorkOrder({ jd_order_no, provider_name, address, install_date })
      onCreated(r.work_order)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">发起费用核对</h3>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <Field label="京东工单号">
            <input
              type="text"
              value={form.jd_order_no}
              onChange={set('jd_order_no')}
              placeholder="如 WO-2026-0912，从京东服务+系统复制"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="服务商名称">
            <input
              type="text"
              value={form.provider_name}
              onChange={set('provider_name')}
              list="provider-suggestions"
              placeholder="选择或输入服务商"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <datalist id="provider-suggestions">
              {PROVIDER_SUGGESTIONS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="项目地址">
            <input
              type="text"
              value={form.address}
              onChange={set('address')}
              placeholder="如 北京市朝阳区望京SOHO"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="安装完成日期">
            <input
              type="date"
              value={form.install_date}
              onChange={set('install_date')}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
          {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={creating}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {creating ? '创建中…' : '确认发起'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-600">{label}</label>
      {children}
    </div>
  )
}
