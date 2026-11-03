import { CalendarDays, RefreshCcw } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useAppContext } from '../../context/useAppContext'
import StatusBadge from '../common/StatusBadge'

const pageTitles = {
  '/dashboard': 'Overview',
  '/upload': 'Upload Dataset',
  '/datasets': 'My Datasets',
  '/compare': 'Compare Datasets',
  '/data-quality': 'Data Quality',
  '/analytics': 'Analytics',
  '/predictions': 'Delay Predictions',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/team': 'Team and Workspaces',
}
const today = new Date().toLocaleDateString(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export const Header = () => {
  const { pathname } = useLocation()
  const { health, refreshWorkspace, setApiError } = useAppContext()
  const { activeOrganization, activeOrganizationId, organizations, selectOrganization, signOut, user } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [accountError, setAccountError] = useState('')
  const title = pathname.startsWith('/datasets/') ? 'Dataset Preview' : pageTitles[pathname] || 'Workspace'
  const refresh = async () => {
    setRefreshing(true)
    try {
      await refreshWorkspace()
    } catch (error) {
      setApiError(error.message)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {organizations.length > 1 && <label className="sr-only" htmlFor="active-organization">Active organization</label>}
          {organizations.length > 1 && <select id="active-organization" value={activeOrganizationId} onChange={(event) => selectOrganization(event.target.value).catch((error) => setAccountError(error.message))} className="max-w-40 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 sm:max-w-56 sm:text-sm">
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>}
          <div className="hidden text-right sm:block"><p className="max-w-40 truncate text-xs font-semibold text-slate-800">{user?.display_name}</p><p className="text-[11px] text-slate-500">{activeOrganization?.role}</p></div>
          <button type="button" onClick={() => signOut().catch((error) => setAccountError(error.message))} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:px-3 sm:text-sm">Sign out</button>
          <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 md:flex">
            <CalendarDays size={15} aria-hidden="true" />
            {today}
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh backend and datasets"
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-60"
          >
            <RefreshCcw className={refreshing ? 'animate-spin' : ''} size={16} aria-hidden="true" />
          </button>
          <StatusBadge status={health.status || 'checking'} />
        </div>
      </div>
      {accountError && <p role="alert" className="px-4 pb-3 text-right text-xs text-rose-700 sm:px-6 lg:px-8">{accountError}</p>}
    </header>
  )
}

export default Header
