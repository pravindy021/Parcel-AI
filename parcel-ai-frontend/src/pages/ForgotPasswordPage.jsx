import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../services/api'

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await requestPasswordReset(email)
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
        <Link to="/" className="text-sm font-bold text-blue-800">PARCEL-AI</Link>
        <h1 className="mt-6 text-2xl font-bold text-slate-950">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">If the account is eligible, reset instructions will be sent through the configured email service.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Account email
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Submitting…' : 'Request reset link'}</button>
        </form>
        <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-blue-700 hover:underline">Back to sign in</Link>
      </section>
    </main>
  )
}

export default ForgotPasswordPage
