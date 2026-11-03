import { useCallback, useEffect, useState } from 'react'
import { Card } from '../components/common/Card'
import { useAuth } from '../context/AuthContext'
import {
  acceptOrganizationInvitation,
  createOrganization,
  createOrganizationWorkspace,
  getOrganizationInvitations,
  getOrganizationMembers,
  getOrganizationWorkspaces,
  inviteOrganizationMember,
  removeOrganizationMember,
  revokeOrganizationInvitation,
  updateOrganizationMemberRole,
} from '../services/api'
import { useSearchParams } from 'react-router-dom'

const roles = ['admin', 'manager', 'analyst', 'viewer']

export const OrganizationPage = () => {
  const { activeOrganization, activeOrganizationId, organizations, refreshSession, selectOrganization } = useAuth()
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [form, setForm] = useState({ email: '', role: 'analyst' })
  const [workspaceName, setWorkspaceName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadOrganization = useCallback(async () => {
    if (!activeOrganizationId) return
    setLoading(true)
    setError('')
    const results = await Promise.allSettled([
      getOrganizationMembers(activeOrganizationId),
      ['owner', 'admin'].includes(activeOrganization?.role)
        ? getOrganizationInvitations(activeOrganizationId)
        : Promise.resolve({ data: { items: [] } }),
      getOrganizationWorkspaces(activeOrganizationId),
    ])
    if (results[0].status === 'fulfilled') setMembers(results[0].value.data.items || [])
    if (results[1].status === 'fulfilled') setInvitations(results[1].value.data.items || [])
    if (results[2].status === 'fulfilled') setWorkspaces(results[2].value.data.items || [])
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) setError(failed.reason.message)
    setLoading(false)
  }, [activeOrganizationId, activeOrganization?.role])

  useEffect(() => { void loadOrganization() }, [loadOrganization])

  const submitInvite = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await inviteOrganizationMember(activeOrganizationId, form)
      setForm({ email: '', role: 'analyst' })
      setNotice(data.delivery_status === 'sent'
        ? `Invitation sent to ${data.email}.`
        : `Invitation for ${data.email} is saved, but email is not configured (${data.delivery_status}).`)
      await loadOrganization()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const submitWorkspace = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await createOrganizationWorkspace(activeOrganizationId, { name: workspaceName })
      setWorkspaceName('')
      setNotice('Workspace created.')
      await loadOrganization()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const submitOrganization = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data } = await createOrganization({ name: organizationName })
      await refreshSession()
      await selectOrganization(data.id)
      setOrganizationName('')
      setNotice(`Switched to ${data.name}.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const changeRole = async (member, role) => {
    setError('')
    try {
      await updateOrganizationMemberRole(activeOrganizationId, member.id, role)
      await loadOrganization()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const removeMember = async (member) => {
    if (!window.confirm(`Remove ${member.email} from ${activeOrganization?.name}?`)) return
    setError('')
    try {
      await removeOrganizationMember(activeOrganizationId, member.id)
      setNotice(`${member.email} was removed from the organization.`)
      await loadOrganization()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const revokeInvite = async (invitation) => {
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) return
    setError('')
    try {
      await revokeOrganizationInvitation(activeOrganizationId, invitation.id)
      setNotice(`Invitation for ${invitation.email} was revoked.`)
      await loadOrganization()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  if (!activeOrganization) return <p role="status">No organization is available for this account.</p>
  const canManageMembers = ['owner', 'admin'].includes(activeOrganization.role)
  const canInvite = canManageMembers || activeOrganization.role === 'manager'
  const canManageWorkspace = ['owner', 'admin'].includes(activeOrganization.role)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-semibold text-blue-700">Organization workspace</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Team and workspaces</h2>
        <p className="mt-2 text-sm text-slate-600">{activeOrganization.name} · Your role: {activeOrganization.role.replaceAll('_', ' ')}</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <Card title="Organization">
        <form onSubmit={submitOrganization} className="flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">Create another organization
            <input required maxLength={120} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Organization name" />
          </label>
          <button disabled={saving} className="self-end rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Create organization</button>
        </form>
        {organizations.length > 1 && <label className="mt-4 block max-w-sm text-sm font-medium text-slate-700">Switch organization
          <select value={activeOrganizationId} onChange={(event) => selectOrganization(event.target.value).catch((requestError) => setError(requestError.message))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} — {organization.role}</option>)}
          </select>
        </label>}
      </Card>

      <Card title="Workspaces">
        {loading ? <p role="status" className="text-sm text-slate-500">Loading workspaces…</p> : workspaces.length ? (
          <ul className="divide-y divide-slate-100">{workspaces.map((workspace) => <li key={workspace.id} className="py-3 text-sm font-medium text-slate-800">{workspace.name}</li>)}</ul>
        ) : <p className="text-sm text-slate-500">No workspaces are available.</p>}
        {canManageWorkspace && <form onSubmit={submitWorkspace} className="mt-4 flex flex-wrap gap-3">
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">Workspace name
            <input required maxLength={120} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <button disabled={saving} className="self-end rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Add workspace</button>
        </form>}
      </Card>

      <Card title="Members">
        {loading ? <p role="status" className="text-sm text-slate-500">Loading members…</p> : members.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="py-3 pr-4">Member</th><th className="py-3 pr-4">Role</th><th className="py-3">Actions</th></tr></thead>
              <tbody>{members.map((member) => <tr key={member.id} className="border-b border-slate-100">
                <td className="py-3 pr-4"><p className="font-medium text-slate-900">{member.display_name}</p><p className="text-xs text-slate-500">{member.email}</p></td>
                <td className="py-3 pr-4">{member.role}</td>
                <td className="py-3">
                  {canManageMembers && member.role !== 'owner' && <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.email}</label>
                    <select id={`role-${member.id}`} value={member.role} onChange={(event) => changeRole(member, event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                      {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <button type="button" onClick={() => removeMember(member)} className="rounded-lg px-2 py-1.5 text-rose-700 hover:bg-rose-50">Remove</button>
                  </div>}
                </td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">No members found.</p>}
        {canInvite && <form onSubmit={submitInvite} className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <label className="text-sm font-medium text-slate-700">Invite by email
            <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              {(activeOrganization.role === 'manager' ? roles.slice(2) : roles).map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <button disabled={saving} className="self-end rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Send invite</button>
        </form>}
      </Card>

      {canManageMembers && <Card title="Pending invitations">
        {invitations.length ? <ul className="divide-y divide-slate-100">{invitations.map((invitation) => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{invitation.email} · {invitation.role}</span><button type="button" onClick={() => revokeInvite(invitation)} className="font-medium text-rose-700 hover:underline">Revoke</button></li>)}</ul> : <p className="text-sm text-slate-500">No pending invitations.</p>}
      </Card>}
    </div>
  )
}

export const AcceptInvitationPage = () => {
  const { refreshSession } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState({ busy: false, error: '', message: '' })
  const accept = async () => {
    setState({ busy: true, error: '', message: '' })
    try {
      const { data } = await acceptOrganizationInvitation(token)
      await refreshSession()
      setState({ busy: false, error: '', message: `Invitation accepted for organization ${data.organization_id}. Switch organizations from the header.` })
    } catch (error) {
      setState({ busy: false, error: error.message, message: '' })
    }
  }
  return <div className="mx-auto max-w-xl"><Card title="Accept organization invitation">
    {!token && <p role="alert" className="text-sm text-rose-700">The invitation token is missing.</p>}
    {state.error && <p role="alert" className="mb-4 text-sm text-rose-700">{state.error}</p>}
    {state.message && <p role="status" className="mb-4 text-sm text-emerald-800">{state.message}</p>}
    <button type="button" onClick={accept} disabled={!token || state.busy || Boolean(state.message)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{state.busy ? 'Accepting…' : 'Accept invitation'}</button>
  </Card></div>
}

export default OrganizationPage
