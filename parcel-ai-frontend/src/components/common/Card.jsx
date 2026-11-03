export const Card = ({ title, children, className = '' }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
    {title ? <h3 className="mb-4 text-base font-semibold text-slate-900">{title}</h3> : null}
    {children}
  </div>
)

export default Card
