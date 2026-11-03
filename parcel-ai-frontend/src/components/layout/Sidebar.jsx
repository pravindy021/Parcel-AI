import { Home } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { navItems } from '../../constants/navigation'

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`

export const Sidebar = () => (
  <aside className="hidden min-h-screen w-64 shrink-0 border-r border-slate-800 bg-slate-950 px-4 py-6 text-slate-200 lg:flex lg:flex-col">
    <NavLink to="/dashboard" className="mb-9 flex items-center gap-3 px-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 font-bold text-slate-950">P</div>
      <div>
        <p className="text-base font-bold tracking-wide text-white">PARCEL-AI</p>
        <p className="text-xs text-slate-400">Logistics Intelligence</p>
      </div>
    </NavLink>
    <nav aria-label="Main navigation" className="space-y-1">
      <NavLink to="/" end className={linkClass}>
        <Home size={17} aria-hidden="true" />
        Landing Page
      </NavLink>
      {navItems.map(({ label, to, icon: Icon }) => (
        <NavLink key={to} to={to} className={linkClass}>
          <Icon size={17} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
    <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm font-semibold text-white">Your workspace</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">Upload shipment data to begin exploring your logistics operations.</p>
    </div>
  </aside>
)

export default Sidebar
