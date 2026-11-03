import { useState } from 'react'
import { Card } from '../components/common/Card'
import { useAuth } from '../context/AuthContext'
import { changePassword, updateProfile } from '../services/api'

export const AccountPage = () => {
  const { user, refreshSession, signOut } = useAuth()
  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const saveProfile = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await updateProfile({ display_name: displayName })
      await refreshSession()
      setNotice('Profile updated.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data } = await changePassword(passwords)
      setNotice(data.message)
      setPasswords({ current_password: '', new_password: '' })
      await signOut()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header><p className="text-sm font-semibold text-blue-700">Account</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Account settings</h2><p className="mt-2 text-sm text-slate-600">Manage your profile and sign-in credentials.</p></header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <Card title="Profile">
        <form onSubmit={saveProfile} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Display name
            <input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <p className="text-sm text-slate-600">Email: <span className="font-medium text-slate-800">{user?.email}</span> · {user?.email_verified ? 'Verified' : 'Not verified'}</p>
          <button disabled={busy} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save profile</button>
        </form>
      </Card>
      <Card title="Change password">
        <form onSubmit={savePassword} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Current password
            <input required type="password" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">New password
            <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
            <span className="mt-1 block text-xs text-slate-500">At least 12 characters. Other active sessions will be revoked.</span>
          </label>
          <button disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Change password</button>
        </form>
      </Card>
    </div>
  )
}

export default AccountPage
