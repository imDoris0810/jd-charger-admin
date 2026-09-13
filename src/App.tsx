import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import OrdersPage from './features/orders'
import ReconciliationPage from './features/reconciliation'
import SettlementPage from './features/settlement'
import DashboardPage from './features/dashboard'
import FeeLibraryPage from './features/fee-library'
import SubmitPage from './features/submit'

const NAV = [
  {
    to: '/orders',
    label: '工单列表',
    match: '/orders',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="17" height="17">
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    to: '/reconciliation/1',
    label: '费用核对',
    match: '/reconciliation',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="17" height="17">
        <circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" />
        <path d="M5 8v10a2 2 0 0 0 2 2h8" /><path d="M19 16V6a2 2 0 0 0-2-2H9" />
      </svg>
    ),
  },
  {
    to: '/settlement/SET-0001',
    label: '结算账单',
    match: '/settlement',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    to: '/dashboard',
    label: '数据看板',
    match: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
        <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    to: '/fee-library',
    label: '标准费用库',
    match: '/fee-library',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    ),
  },
  {
    to: '/submit/demo-token',
    label: '服务商提交',
    match: '/submit',
    tag: '链接视图',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
]

const PAGE_META: Record<string, { title: string; crumb: string }> = {
  '/orders': { title: '工单列表', crumb: '工作台 / 工单列表' },
  '/reconciliation': { title: '费用核对', crumb: '工作台 / 费用核对' },
  '/settlement': { title: '结算账单', crumb: '工作台 / 结算账单' },
  '/dashboard': { title: '数据看板', crumb: '工作台 / 数据看板' },
  '/fee-library': { title: '标准费用库', crumb: '工作台 / 标准费用库' },
  '/submit': { title: '服务商提交', crumb: '工作台 / 服务商提交' },
}

function getPageMeta(pathname: string) {
  for (const [prefix, meta] of Object.entries(PAGE_META)) {
    if (pathname.startsWith(prefix)) return meta
  }
  return { title: '工单列表', crumb: '工作台 / 工单列表' }
}

export default function App() {
  const location = useLocation()
  const isSubmit = location.pathname.startsWith('/submit/')
  const { title, crumb } = getPageMeta(location.pathname)

  if (isSubmit) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/submit/:token" element={<SubmitPage />} />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── 侧边栏 ── */}
      <aside style={{
        width: 224,
        flexShrink: 0,
        background: '#1C2536',
        color: '#CBD5E1',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}>
        {/* 品牌 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '18px 18px 16px',
          borderBottom: '1px solid rgba(255,255,255,.08)',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: '#0065BD',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, color: '#fff', fontWeight: 700, flexShrink: 0,
          }}>充</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.25 }}>充电桩费用核对平台</div>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 400 }}>京东 · 内网工具</div>
          </div>
        </div>

        {/* 导航 */}
        <nav style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((n) => {
            const active = location.pathname.startsWith(n.match)
            return (
              <Link
                key={n.to}
                to={n.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8,
                  color: active ? '#fff' : '#CBD5E1',
                  background: active ? '#0065BD' : 'transparent',
                  fontSize: 13.5, fontWeight: 500,
                  textDecoration: 'none',
                  transition: 'background .12s, color .12s',
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,.06)'
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
                }}
              >
                {n.icon}
                {n.label}
                {n.tag && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 10.5,
                    padding: '1px 7px', borderRadius: 999,
                    background: active ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.12)',
                    color: active ? '#fff' : '#CBD5E1',
                  }}>{n.tag}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* 底部 */}
        <div style={{
          marginTop: 'auto', padding: '14px 18px',
          borderTop: '1px solid rgba(255,255,255,.08)',
          fontSize: 11, color: '#64748B',
        }}>
          内网管理工具 · v1.0
        </div>
      </aside>

      {/* ── 主区域 ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#F5F7FA' }}>
        {/* Topbar */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #E5E7EB',
          padding: '12px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1F2937' }}>{title}</h1>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{crumb}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: '#1F2937' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#EFF6FF', color: '#0065BD',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: 13,
            }}>周</div>
            <div>周明</div>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 999,
              background: '#F3F4F6', color: '#4B5563',
            }}>operator · 费用核对</span>
          </div>
        </header>

        {/* 内容 */}
        <main style={{ flex: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/orders" replace />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/reconciliation/:id?" element={<ReconciliationPage />} />
            <Route path="/settlement/:id" element={<SettlementPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/fee-library" element={<FeeLibraryPage />} />
            <Route path="/submit/:token" element={<SubmitPage />} />
            <Route path="*" element={<Navigate to="/orders" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
