import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const RegisterPage = () => {
  const { signUp } = useAuth()
  const [form, setForm] = useState({ display_name: '', email: '', organization_name: '', password: '' })
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await signUp(form)
      setResult(response.data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <Link to="/" className="text-sm font-bold tracking-wide text-blue-800">PARCEL-AI</Link>
        <h1 className="mt-6 text-2xl font-bold text-slate-950">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Registration creates an organization and an owner workspace. Verify your email before signing in.</p>
        {result ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="font-semibold text-emerald-900">Account created; verification is required</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              {result.email_delivery === 'sent'
                ? 'Verification instructions were sent by the configured email service.'
                : 'Email delivery is not configured, so no message was sent. Configure SMTP and request a new verification email before signing in.'}
            </p>
            <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-blue-700 underline">Continue to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">Your name
              <input required maxLength={120} autoComplete="name" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Work email
              <input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Organization name
              <input required maxLength={120} value={form.organization_name} onChange={(event) => setForm({ ...form, organization_name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Password
              <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              <span className="mt-1 block text-xs text-slate-500">Use at least 12 characters.</span>
            </label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{busy ? 'Creating account…' : 'Create account'}</button>
          </form>
        )}
        {!result && <p className="mt-5 text-sm text-slate-600">Already registered? <Link to="/login" className="font-semibold text-blue-700 hover:underline">Sign in</Link></p>}
      </section>
    </main>
  )
}

export default RegisterPage
