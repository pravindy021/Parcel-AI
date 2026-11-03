import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyEmail } from '../services/api'

export const VerifyEmailPage = () => {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState({ loading: true, error: '', message: '' })

  useEffect(() => {
    let active = true
    if (!token) {
      setState({ loading: false, error: 'The verification link is missing its token.', message: '' })
      return () => { active = false }
    }
    verifyEmail(token)
      .then(({ data }) => { if (active) setState({ loading: false, error: '', message: data.message }) })
      .catch((error) => { if (active) setState({ loading: false, error: error.message, message: '' }) })
    return () => { active = false }
  }, [token])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Email verification</h1>
        {state.loading && <p role="status" className="mt-4 text-sm text-slate-600">Verifying the one-time link…</p>}
        {state.error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
        {state.message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.message}</p>}
        <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-blue-700 hover:underline">Go to sign in</Link>
      </section>
    </main>
  )
}

export default VerifyEmailPage
