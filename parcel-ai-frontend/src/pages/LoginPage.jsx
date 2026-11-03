import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resendVerification } from '../services/api'

export const LoginPage = () => {
  const { signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await signIn(form)
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setBusy(true)
    setError('')
    try {
      const { data } = await resendVerification(form.email)
      setMessage(data.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <Link to="/" className="text-sm font-bold tracking-wide text-blue-800">PARCEL-AI</Link>
        <h1 className="mt-6 text-2xl font-bold text-slate-950">Sign in to your workspace</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use your verified account to access organization data.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Email
            <input required autoComplete="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input required autoComplete="current-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {message && <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
          {error.toLowerCase().includes('verify your email') && (
            <button type="button" onClick={resend} disabled={busy || !form.email} className="text-sm font-semibold text-blue-700 underline disabled:opacity-50">Resend verification instructions</button>
          )}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="mt-5 flex justify-between gap-3 text-sm">
          <Link className="font-medium text-blue-700 hover:underline" to="/forgot-password">Forgot password?</Link>
          <Link className="font-medium text-blue-700 hover:underline" to="/register">Create account</Link>
        </div>
      </section>
    </main>
  )
}

export default LoginPage
