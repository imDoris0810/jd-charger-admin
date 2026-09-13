import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import OrdersPage from './features/orders'
import ReconciliationPage from './features/reconciliation'
import SettlementPage from './features/settlement'
import DashboardPage from './features/dashboard'
import FeeLibraryPage from './features/fee-library'
import SubmitPage from './features/submit'

const NAV = [
  { to: '/orders', label: '工单列表' },
  { to: '/reconciliation/1', label: '费用核对' },
  { to: '/settlement/SET-0001', label: '结算账单' },
  { to: '/dashboard', label: '数据看板' },
  { to: '/fee-library', label: '标准费用库' },
  { to: '/submit/demo-token', label: '服务商提交(演示)' },
]

export default function App() {
  const location = useLocation()
  // 服务商提交页为免登录独立路由，不渲染管理端导航
  const isSubmit = location.pathname.startsWith('/submit/')
  return (
    <div className="min-h-screen bg-gray-50">
      {!isSubmit && (
        <header className="border-b bg-white px-6 py-3 flex items-center gap-4 print:hidden">
          <span className="font-semibold">充电桩费用核对平台</span>
          <nav className="flex gap-3 text-sm text-gray-600">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="hover:text-blue-600">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
      )}
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
    </div>
  )
}
