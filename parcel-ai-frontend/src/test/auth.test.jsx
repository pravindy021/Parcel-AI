import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '../context/AuthContext'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import LoginPage from '../pages/LoginPage'
import { getCurrentUser, loginAccount, logoutAccount } from '../services/api'

vi.mock('../services/api', () => ({
  getCurrentUser: vi.fn(),
  loginAccount: vi.fn(),
  logoutAccount: vi.fn(),
  registerAccount: vi.fn(),
}))

const AuthProbe = () => {
  const { activeOrganization, isAuthenticated, signOut } = useAuth()
  return (
    <div>
      <p>{isAuthenticated ? activeOrganization?.name : 'Signed out'}</p>
      <button type="button" onClick={() => signOut()}>Sign out</button>
    </div>
  )
}

const sessionResponse = {
  data: {
    user: { id: 'user-1', display_name: 'Test User', email: 'user@example.test' },
    organizations: [{ id: 'org-1', name: 'Test Organization', role: 'owner' }],
  },
}

beforeEach(() => {
  sessionStorage.clear()
  getCurrentUser.mockRejectedValue(Object.assign(new Error('Authentication is required'), { status: 401 }))
  loginAccount.mockResolvedValue(sessionResponse)
  logoutAccount.mockResolvedValue({ data: { logged_out: true } })
})

describe('SaaS authentication flows', () => {
  it('restores a signed-in session and organization context', async () => {
    getCurrentUser.mockResolvedValue(sessionResponse)
    render(<AuthProvider><AuthProbe /></AuthProvider>)
    expect(await screen.findByText('Test Organization')).toBeInTheDocument()
    expect(sessionStorage.getItem('parcel-ai-organization-id')).toBe('org-1')
  })

  it('protects workspace routes and sends unauthenticated users to login', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>Login destination</p>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<p>Private dashboard</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Login destination')).toBeInTheDocument()
    expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument()
  })

  it('submits credentials, enters the workspace, and revokes the session at logout', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<AuthProbe />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: /sign in to your workspace/i })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Test Organization')).toBeInTheDocument()
    await waitFor(() => expect(loginAccount).toHaveBeenCalledWith({
      email: 'user@example.test',
      password: 'correct-password',
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: /sign in to your workspace/i })).toBeInTheDocument()
    expect(logoutAccount).toHaveBeenCalledOnce()
  })
})
