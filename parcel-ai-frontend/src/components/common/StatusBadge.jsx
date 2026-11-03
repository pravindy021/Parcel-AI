export const StatusBadge = ({ status = 'healthy' }) => {
  const normalized = String(status).toLowerCase()
  const styles = {
    healthy: 'bg-emerald-100 text-emerald-700',
    connected: 'bg-emerald-100 text-emerald-700',
    passed: 'bg-emerald-100 text-emerald-700',
    low: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    medium: 'bg-amber-100 text-amber-700',
    failed: 'bg-rose-100 text-rose-700',
    high: 'bg-rose-100 text-rose-700',
    checking: 'bg-slate-100 text-slate-600',
    disconnected: 'bg-rose-100 text-rose-700',
    uploaded: 'bg-blue-100 text-blue-700',
    validated: 'bg-emerald-100 text-emerald-700',
    needs_review: 'bg-amber-100 text-amber-700',
    unknown: 'bg-slate-100 text-slate-600',
    not_checked: 'bg-slate-100 text-slate-600',
  }
  const label = normalized.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[normalized] || styles.unknown}`}>
      {label}
    </span>
  )
}

export default StatusBadge
