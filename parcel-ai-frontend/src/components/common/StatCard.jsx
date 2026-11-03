import { CircleHelp } from 'lucide-react'
import { useId } from 'react'

export const StatCard = ({ label, value, detail, tooltip, tone = 'neutral' }) => {
  const tooltipId = useId()
  const toneClasses = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  }

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone] || toneClasses.neutral}`}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        <span>{label}</span>
        {tooltip && <span className="group relative inline-flex" tabIndex={0} aria-label={`Definition: ${tooltip}`} aria-describedby={tooltipId}>
          <CircleHelp size={14} aria-hidden="true" />
          <span id={tooltipId} role="tooltip" className="invisible absolute bottom-full left-0 z-20 mb-2 w-56 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal leading-5 text-white opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">{tooltip}</span>
        </span>}
      </p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {detail ? <span className="text-xs font-medium text-slate-600">{detail}</span> : null}
      </div>
    </div>
  )
}

export default StatCard
