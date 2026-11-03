import { AlertCircle, X } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAppContext } from '../../context/useAppContext'
import { navItems } from '../../constants/navigation'
import Header from './Header'
import Sidebar from './Sidebar'

const MobileNavigation = () => (
  <nav aria-label="Mobile navigation" className="overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
    <div className="flex min-w-max gap-1">
      {navItems.map(({ label, to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
              isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          <Icon size={15} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </div>
  </nav>
)

export const AppLayout = () => {
  const { apiError, setApiError } = useAppContext()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Header />
          <MobileNavigation />
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
            {apiError && (
              <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{apiError}</span>
                <button type="button" onClick={() => setApiError('')} aria-label="Dismiss error" className="rounded p-1 hover:bg-rose-100">
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AppLayout
