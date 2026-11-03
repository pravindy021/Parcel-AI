import { Activity, Check, CircleHelp, RefreshCw, ServerCog, SunMedium, X } from 'lucide-react'
import { useState } from 'react'
import { Card } from '../components/common/Card'
import StatusBadge from '../components/common/StatusBadge'
import { API_BASE_URL } from '../services/api'
import { useAppContext } from '../context/useAppContext'

export const SettingsPage = () => {
  const { checkHealth, health } = useAppContext()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const checkConnection = async () => {
    setChecking(true)
    setError('')
    try {
      await checkHealth()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><p className="text-sm font-semibold text-blue-700">Workspace preferences</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Settings</h2><p className="mt-2 text-sm text-slate-600">Application and backend connection information. No user account settings are configured.</p></div>

      <Card title="Backend connection">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><ServerCog size={20} aria-hidden="true" /></span>
            <div><p className="font-semibold text-slate-900">Parcel-AI API</p><p className="mt-1 break-all text-sm text-slate-600">{API_BASE_URL || 'Same origin (relative URL)'}</p><div className="mt-3"><StatusBadge status={health.status || 'checking'} /></div></div>
          </div>
          <button type="button" onClick={checkConnection} disabled={checking} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={15} className={checking ? 'animate-spin' : ''} aria-hidden="true" /> Check connection
          </button>
        </div>
        {error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><X size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
        {health.status === 'connected' && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><Check size={16} aria-hidden="true" />Health endpoint reports that the backend is healthy.</p>}
        {health.status === 'disconnected' && !error && <p className="mt-4 text-sm text-slate-600">The backend health endpoint could not be reached. Confirm that the API is running and that its CORS configuration includes this frontend origin.</p>}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Application">
          <div className="space-y-4">
            <div className="flex items-start gap-3"><Activity size={17} className="mt-0.5 text-blue-700" aria-hidden="true" /><div><p className="text-sm font-medium text-slate-800">Shipment analytics workspace</p><p className="mt-1 text-xs leading-5 text-slate-500">Dataset upload, validation, analysis, model training, predictions, and available exports.</p></div></div>
            <div className="flex items-start gap-3"><SunMedium size={17} className="mt-0.5 text-amber-600" aria-hidden="true" /><div><p className="text-sm font-medium text-slate-800">Light theme</p><p className="mt-1 text-xs leading-5 text-slate-500">The current frontend supports the light appearance.</p></div></div>
          </div>
        </Card>
        <Card title="Backend capability notes">
          <div className="flex items-start gap-3"><CircleHelp size={17} className="mt-0.5 text-slate-500" aria-hidden="true" /><p className="text-sm leading-6 text-slate-600">API capabilities determine which analytics and model actions are available. Report listing, server-side filtering, and configuration discovery are not exposed by the current API.</p></div>
        </Card>
      </div>
    </div>
  )
}

export default SettingsPage
