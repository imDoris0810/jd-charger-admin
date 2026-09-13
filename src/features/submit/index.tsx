import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { StandardFeeItem } from '../../config/schema'
import { api, type SubmissionItemInput, type SubmitInfo } from '../../shared/api'
import { centsToYuan } from '../../shared/format'

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

export default function SubmitPage() {
  const { token } = useParams()

  const [info, setInfo] = useState<SubmitInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // 表单状态：fixed → 勾选确认；per_meter/per_unit → 数量；actual → 名称 + 金额
  const [confirmed, setConfirmed] = useState<Record<number, boolean>>({})
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [extras, setExtras] = useState<Record<number, { name: string; amount: string }>>({})

  useEffect(() => {
    if (!token) {
      setError('链接无效或已过期')
      setLoading(false)
      return
    }
    let cancelled = false
    api
      .getSubmitInfo(token)
      .then((r) => {
        if (cancelled) return
        setInfo(r)
        const c: Record<number, boolean> = {}
        for (const s of r.standard_items) if (s.calc_method === 'fixed') c[s.id] = true
        setConfirmed(c)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '链接无效或已过期')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const standardItems = info?.standard_items ?? []
  const alreadySubmitted = info != null && info.work_order.status !== 'pending_submit'
  const readonly = alreadySubmitted || done

  function rowSubtotal(s: StandardFeeItem): number | null {
    if (s.calc_method === 'fixed') {
      return confirmed[s.id] && s.unit_price_cents != null ? s.unit_price_cents : null
    }
    if (s.calc_method === 'per_meter' || s.calc_method === 'per_unit') {
      const q = parseFloat(quantities[s.id] ?? '')
      if (!Number.isFinite(q) || q <= 0 || s.unit_price_cents == null) return null
      return Math.round(q * s.unit_price_cents)
    }
    const amountYuan = parseFloat(extras[s.id]?.amount ?? '')
    if (!Number.isFinite(amountYuan) || amountYuan <= 0) return null
    return Math.round(amountYuan * 100)
  }

  function buildItems(): SubmissionItemInput[] {
    const items: SubmissionItemInput[] = []
    for (const s of standardItems) {
      if (s.calc_method === 'fixed') {
        if (confirmed[s.id] && s.unit_price_cents != null) {
          items.push({
            item_name: s.name,
            quantity: 1,
            unit_price_cents: s.unit_price_cents,
            subtotal_cents: s.unit_price_cents,
          })
        }
      } else if (s.calc_method === 'per_meter' || s.calc_method === 'per_unit') {
        const q = parseFloat(quantities[s.id] ?? '')
        if (!Number.isFinite(q) || q <= 0 || s.unit_price_cents == null) continue
        items.push({
          item_name: s.name,
          quantity: q,
          unit_price_cents: s.unit_price_cents,
          subtotal_cents: Math.round(q * s.unit_price_cents),
        })
      } else {
        const name = (extras[s.id]?.name ?? '').trim()
        const amountYuan = parseFloat(extras[s.id]?.amount ?? '')
        if (!name || !Number.isFinite(amountYuan) || amountYuan <= 0) continue
        items.push({ item_name: name, quantity: null, unit_price_cents: null, subtotal_cents: Math.round(amountYuan * 100) })
      }
    }
    return items
  }

  const items = buildItems()
  const totalCents = items.reduce((sum, it) => sum + it.subtotal_cents, 0)
  const unconfirmedFixed = standardItems.some((s) => s.calc_method === 'fixed' && !confirmed[s.id])

  const onSubmit = async () => {
    if (!token) return
    if (unconfirmedFixed) {
      setSubmitError('请先确认基础安装费用')
      return
    }
    if (items.length === 0) {
      setSubmitError('请填写至少一项费用明细')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await api.submitProvider(token, items)
      setDone(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- 加载 / 错误 ----
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-400">
        加载中…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white px-8 py-10 text-center">
          <p className="text-3xl">⚠️</p>
          <h1 className="mt-3 text-lg font-semibold text-gray-900">{error}</h1>
          <p className="mt-2 text-sm text-gray-500">请与京东业务人员确认提交链接是否正确。</p>
        </div>
      </div>
    )
  }

  const order = info!.work_order

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-gray-900">充电桩安装费用提交</h1>
        <p className="mt-1 text-sm text-gray-500">通过工单链接提交费用明细 · 无需登录</p>

        {/* 工单信息 */}
        <div className="mt-5 rounded-lg bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Info label="工单号" value={order.jd_order_no} mono />
            <Info label="服务商" value={order.provider_name} />
            <Info label="项目地址" value={order.address} />
            <Info label="安装完成日期" value={order.install_date} />
          </div>
        </div>

        {readonly ? (
          /* 已提交 / 只读态 */
          <div className="mt-5 rounded-lg bg-white px-6 py-10 text-center shadow-sm ring-1 ring-gray-200">
            <p className="text-3xl">✅</p>
            <h2 className="mt-3 text-lg font-semibold text-gray-900">已提交，等待核对</h2>
            <p className="mt-2 text-sm text-gray-500">
              费用明细已提交，工单进入「待核对」状态，请等待京东业务人员核对。
            </p>
            <p className="mt-1 text-xs text-gray-400">提交链接一次性有效，不可再次编辑或提交。</p>
          </div>
        ) : (
          <>
            {/* 费用填写区 */}
            <div className="mt-5 rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-sm font-medium text-gray-900">按京东标准费用项填写</h2>
                <p className="mt-0.5 text-xs text-gray-500">单价由系统预设，仅需填写数量/米数</p>
              </div>

              <div className="divide-y divide-gray-100 px-5 py-2">
                {standardItems.map((s, i) => (
                  <FeeRow
                    key={s.id}
                    item={s}
                    index={i}
                    confirmed={!!confirmed[s.id]}
                    quantity={quantities[s.id] ?? ''}
                    extra={extras[s.id] ?? { name: '', amount: '' }}
                    subtotal={rowSubtotal(s)}
                    onToggleConfirm={(v) => setConfirmed((p) => ({ ...p, [s.id]: v }))}
                    onQuantity={(v) => setQuantities((p) => ({ ...p, [s.id]: v }))}
                    onExtra={(patch) =>
                      setExtras((p) => ({
                        ...p,
                        [s.id]: {
                          name: patch.name ?? p[s.id]?.name ?? '',
                          amount: patch.amount ?? p[s.id]?.amount ?? '',
                        },
                      }))
                    }
                  />
                ))}
              </div>
            </div>

            {/* 提交区 */}
            <div className="mt-5">
              <div className="flex items-center justify-between rounded-lg bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200">
                <span className="text-sm text-gray-500">本次提交合计</span>
                <span className="text-2xl font-semibold text-gray-900">¥{centsToYuan(totalCents)}</span>
              </div>

              {submitError && (
                <div className="mt-3 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{submitError}</div>
              )}

              <button
                onClick={onSubmit}
                disabled={submitting}
                className="mt-3 w-full rounded bg-[#E74242] py-3 text-sm font-medium text-white hover:bg-[#D03434] disabled:opacity-60"
              >
                {submitting ? '提交中…' : '提交费用明细'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- 子组件 ----

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`ml-2 text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

interface FeeRowProps {
  item: StandardFeeItem
  index: number
  confirmed: boolean
  quantity: string
  extra: { name: string; amount: string }
  subtotal: number | null
  onToggleConfirm: (v: boolean) => void
  onQuantity: (v: string) => void
  onExtra: (patch: { name?: string; amount?: string }) => void
}

function FeeRow({
  item,
  index,
  confirmed,
  quantity,
  extra,
  subtotal,
  onToggleConfirm,
  onQuantity,
  onExtra,
}: FeeRowProps) {
  const circled = CIRCLED[index] ?? `${index + 1}.`
  const isFixed = item.calc_method === 'fixed'
  const isMeter = item.calc_method === 'per_meter'
  const isUnit = item.calc_method === 'per_unit'
  const isActual = item.calc_method === 'actual'

  const tag = isFixed
    ? '标准价 · 不可修改'
    : isMeter
      ? `单价 ${centsToYuan(item.unit_price_cents)} 元/米`
      : isUnit
        ? `单价 ${centsToYuan(item.unit_price_cents)} 元/个`
        : '需人工审批'

  const unitLabel = isMeter ? '米' : isUnit ? '个' : ''

  return (
    <div className="py-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">
          {circled} {item.name}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            isActual ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-600'
          }`}
        >
          {tag}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="min-w-[180px] flex-1 text-xs text-gray-500">{item.remark ?? ''}</p>

        {isFixed && (
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => onToggleConfirm(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            我已确认
          </label>
        )}

        {(isMeter || isUnit) && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step={isMeter ? 'any' : '1'}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => onQuantity(e.target.value)}
              placeholder={isMeter ? '实际米数' : '数量'}
              className="w-32 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
            />
            {unitLabel && <span className="text-sm text-gray-500">{unitLabel}</span>}
          </div>
        )}

        {isActual && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={extra.name}
              onChange={(e) => onExtra({ name: e.target.value })}
              placeholder="增项名称（如：高空作业费）"
              className="w-48 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={extra.amount}
              onChange={(e) => onExtra({ amount: e.target.value })}
              placeholder="金额（元）"
              className="w-28 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
            />
            <span className="text-sm text-gray-500">元</span>
          </div>
        )}

        <span className="min-w-[88px] text-right text-sm font-medium text-gray-800">
          {subtotal == null ? '—' : `¥${centsToYuan(subtotal)}`}
        </span>
      </div>
    </div>
  )
}
