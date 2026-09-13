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

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (toast == null) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const openCreate = () => { setEditing(null); setShowModal(true) }
  const openEdit = (it: StandardFeeItem) => { setEditing(it); setShowModal(true) }

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
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* 警示横幅 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 14px', borderRadius: 8, marginBottom: 16,
        background: '#FEF6E7', border: '1px solid #FDE68A', color: '#92400E',
        fontSize: 13,
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>标准费用库为全局固定，由 <strong>admin</strong> 维护；修改会留痕并对历史工单生效，请谨慎操作。</span>
      </div>

      {/* 工具栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8,
          background: '#fff', fontSize: 13, color: '#9CA3AF', minWidth: 260,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="搜索费用项…" style={{
            border: 'none', outline: 'none', fontSize: 13, width: '100%',
            color: '#1F2937', background: 'transparent',
          }} />
        </div>
        <button
          onClick={openCreate}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: '#0065BD', color: '#fff', border: 'none',
            padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新增标准项
        </button>
      </div>

      {error && <div className="mb-4 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {loading && items.length === 0 ? (
        <div className="mt-12 text-center text-sm text-gray-400">加载中…</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(16,24,40,.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['费用项', '类型', '计费方式', '单价', '说明', '状态', '最近更新', '操作'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i >= 7 ? 'right' : 'left',
                      fontSize: 12, fontWeight: 600, color: '#6B7280',
                      padding: '10px 14px', borderBottom: '1px solid #E5E7EB',
                      background: '#FAFBFC', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #E5E7EB' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#EFF6FF'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                  >
                    {/* 费用项 */}
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1F2937' }}>{it.name}</td>

                    {/* 类型 */}
                    <td style={{ padding: '12px 14px' }}>
                      {it.included_in_base_fee === 1 ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 12, fontWeight: 500, padding: '2px 9px', borderRadius: 999,
                          background: '#EFF6FF', color: '#0065BD',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                          基础项
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 12, fontWeight: 500, padding: '2px 9px', borderRadius: 999,
                          background: '#F3F4F6', color: '#4B5563',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                          增项
                        </span>
                      )}
                    </td>

                    {/* 计费方式 */}
                    <td style={{ padding: '12px 14px', color: '#6B7280' }}>{CALC_LABEL[it.calc_method]}</td>

                    {/* 单价 */}
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1F2937', fontVariantNumeric: 'tabular-nums' }}>
                      {it.unit_price_cents == null ? '—' : `¥${centsToYuan(it.unit_price_cents)}`}
                    </td>

                    {/* 说明 */}
                    <td style={{ padding: '12px 14px', color: '#6B7280' }}>{it.remark || '—'}</td>

                    {/* 状态 */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 12, fontWeight: 500, padding: '2px 9px', borderRadius: 999,
                        background: it.is_active === 1 ? '#EAF7F0' : '#F3F4F6',
                        color: it.is_active === 1 ? '#27AE60' : '#4B5563',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                        {it.is_active === 1 ? '启用' : '停用'}
                      </span>
                    </td>

                    {/* 最近更新 */}
                    <td style={{ padding: '12px 14px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                      {it.updated_at ? it.updated_at.slice(0, 10) + ' · 管理员' : '—'}
                    </td>

                    {/* 操作 */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => openEdit(it)}
                        style={{ fontSize: 13, color: '#0065BD', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6 }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                      >编辑</button>
                      <button
                        onClick={() => toggleActive(it)}
                        style={{
                          fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                          marginLeft: 4, padding: '4px 6px', borderRadius: 6,
                          color: it.is_active === 1 ? '#B45309' : '#27AE60',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                      >{it.is_active === 1 ? '停用' : '启用'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 18, right: 18, zIndex: 200,
          background: '#111827', color: '#fff', fontSize: 13,
          padding: '11px 16px', borderRadius: 9,
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: '#34D399', fontWeight: 700 }}>✓</span> {toast}
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
          unit_price_yuan: editing.unit_price_cents == null ? '' : String(editing.unit_price_cents / 100),
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
    if (!name) { setError('费用项名称不能为空'); return }
    let unitPriceCents: number | null = null
    if (!isActual) {
      const yuan = parseFloat(form.unit_price_yuan)
      if (!Number.isFinite(yuan) || yuan <= 0) { setError('请填写有效的单价'); return }
      unitPriceCents = Math.round(yuan * 100)
    }
    const body = {
      name,
      calc_method: form.calc_method,
      unit_price_cents: unitPriceCents,
      included_in_base_fee: form.included_in_base_fee ? 1 : 0,
      remark: form.remark.trim() || null,
    }
    setSaving(true); setError(null)
    try {
      if (editing) await api.updateStandardItem(editing.id, body)
      else await api.createStandardItem(body)
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
          <h3 className="text-base font-semibold text-gray-900">{editing ? '编辑标准费用项' : '新增标准费用项'}</h3>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型">
              <select
                value={form.included_in_base_fee ? 'base' : 'extra'}
                onChange={(e) => setForm((p) => ({ ...p, included_in_base_fee: e.target.value === 'base' }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="base">基础项</option>
                <option value="extra">增项</option>
              </select>
            </Field>
            <Field label="计算方式">
              <select
                value={form.calc_method}
                onChange={(e) => setForm((p) => ({ ...p, calc_method: e.target.value as CalcMethod }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {(Object.keys(CALC_LABEL) as CalcMethod[]).map((m) => (
                  <option key={m} value={m}>{CALC_LABEL[m]}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="费用项名称">
            <input type="text" value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </Field>
          <Field label="单价（元）">
            <input type="number" min="0" step="any" inputMode="decimal"
              value={form.unit_price_yuan} disabled={isActual}
              onChange={(e) => setForm((p) => ({ ...p, unit_price_yuan: e.target.value }))}
              placeholder={isActual ? '据实填写，无标准单价' : '如 660'}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
          </Field>
          <Field label="说明">
            <input type="text" value={form.remark}
              onChange={(e) => setForm((p) => ({ ...p, remark: e.target.value }))}
              placeholder="如：含材料、配件、安装"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </Field>
          {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">取消</button>
          <button onClick={submit} disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
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
