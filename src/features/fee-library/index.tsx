import { useCallback, useEffect, useState } from 'react'
import type { CalcMethod, StandardFeeItem } from '../../config/schema'
import { api } from '../../shared/api'
import { centsToYuan } from '../../shared/format'

const CALC_LABEL: Record<CalcMethod, string> = {
  fixed: '固定费用',
  per_meter: '按米计费',
  per_unit: '按个计费',
  actual: '据实填写',
}

interface FormState {
  name: string
  calc_method: CalcMethod
  unit_price_yuan: string
  included_in_base_fee: boolean
  remark: string
}

const EMPTY_FORM: FormState = {
  name: '',
  calc_method: 'fixed',
  unit_price_yuan: '',
  included_in_base_fee: false,
  remark: '',
}

export default function FeeLibraryPage() {
  const [items, setItems] = useState<StandardFeeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<StandardFeeItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.listStandardItems()
      setItems(r.items)
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

  const openCreate = () => {
    setEditing(null)
    setShowModal(true)
  }
  const openEdit = (it: StandardFeeItem) => {
    setEditing(it)
    setShowModal(true)
  }

  const toggleActive = async (it: StandardFeeItem) => {
    if (it.is_active === 1) {
      const ok = window.confirm('停用后新工单将无法匹配此项，历史数据不受影响，确认停用？')
      if (!ok) return
    }
    try {
      await api.updateStandardItem(it.id, { is_active: it.is_active === 1 ? 0 : 1 })
      setToast(it.is_active === 1 ? `「${it.name}」已停用` : `「${it.name}」已启用`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">标准费用库</h1>
          <p className="mt-1 text-sm text-gray-500">全局固定的京东标准费用项，所有工单共用同一核对基准</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新增标准项
        </button>
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {loading && items.length === 0 ? (
        <div className="mt-12 text-center text-sm text-gray-400">加载中…</div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">费用项</th>
                <th className="px-4 py-3 font-medium">计算方式</th>
                <th className="px-4 py-3 text-right font-medium">单价</th>
                <th className="px-4 py-3 font-medium">已含基础费</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">{it.name}</span>
                    {it.remark && <p className="mt-0.5 text-xs text-gray-400">{it.remark}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{CALC_LABEL[it.calc_method]}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                    {it.unit_price_cents == null ? '—' : `¥${centsToYuan(it.unit_price_cents)}`}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{it.included_in_base_fee === 1 ? '是' : '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ${
                        it.is_active === 1
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: it.is_active === 1 ? '#27AE60' : '#9CA3AF' }}
                      />
                      {it.is_active === 1 ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(it)} className="text-sm text-blue-600 hover:text-blue-700">
                      编辑
                    </button>
                    <button
                      onClick={() => toggleActive(it)}
                      className={`ml-3 text-sm ${
                        it.is_active === 1 ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700'
                      }`}
                    >
                      {it.is_active === 1 ? '停用' : '启用'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {showModal && (
        <StandardItemModal
          editing={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            setToast(editing ? '标准项已更新' : '标准项已新增')
            void load()
          }}
        />
      )}
    </div>
  )
}

function StandardItemModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: StandardFeeItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    editing
      ? {
          name: editing.name,
          calc_method: editing.calc_method,
          unit_price_yuan:
            editing.unit_price_cents == null ? '' : String(editing.unit_price_cents / 100),
          included_in_base_fee: editing.included_in_base_fee === 1,
          remark: editing.remark ?? '',
        }
      : EMPTY_FORM,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isActual = form.calc_method === 'actual'

  const submit = async () => {
    const name = form.name.trim()
    if (!name) {
      setError('费用项名称不能为空')
      return
    }
    let unitPriceCents: number | null = null
    if (!isActual) {
      const yuan = parseFloat(form.unit_price_yuan)
      if (!Number.isFinite(yuan) || yuan <= 0) {
        setError('请填写有效的单价')
        return
      }
      unitPriceCents = Math.round(yuan * 100)
    }
    const body = {
      name,
      calc_method: form.calc_method,
      unit_price_cents: unitPriceCents,
      included_in_base_fee: form.included_in_base_fee ? 1 : 0,
      remark: form.remark.trim() || null,
    }
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await api.updateStandardItem(editing.id, body)
      } else {
        await api.createStandardItem(body)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            {editing ? '编辑标准费用项' : '新增标准费用项'}
          </h3>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <Field label="费用项名称">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="计算方式">
            <select
              value={form.calc_method}
              onChange={(e) => setForm((p) => ({ ...p, calc_method: e.target.value as CalcMethod }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {(Object.keys(CALC_LABEL) as CalcMethod[]).map((m) => (
                <option key={m} value={m}>
                  {CALC_LABEL[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="单价（元）">
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={form.unit_price_yuan}
              disabled={isActual}
              onChange={(e) => setForm((p) => ({ ...p, unit_price_yuan: e.target.value }))}
              placeholder={isActual ? '据实填写，无标准单价' : '如 660'}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.included_in_base_fee}
              onChange={(e) => setForm((p) => ({ ...p, included_in_base_fee: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            已含于基础安装费（命中时按「合同已含」核减）
          </label>
          <Field label="备注">
            <input
              type="text"
              value={form.remark}
              onChange={(e) => setForm((p) => ({ ...p, remark: e.target.value }))}
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
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存'}
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
