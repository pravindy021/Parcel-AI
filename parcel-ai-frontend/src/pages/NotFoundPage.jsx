import { Link } from 'react-router-dom'

export const NotFoundPage = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
    <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">404</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-3 text-slate-600">The route you are looking for does not exist.</p>
      <Link to="/dashboard" className="mt-6 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Return to dashboard</Link>
    </div>
  </div>
)

export default NotFoundPage
