import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCurrentUser,
  loginAccount,
  logoutAccount,
  registerAccount,
} from '../services/api'

const AuthContext = createContext(null)
const ORGANIZATION_STORAGE_KEY = 'parcel-ai-organization-id'

const storedOrganizationId = () => {
  if (typeof sessionStorage === 'undefined') return ''
  return sessionStorage.getItem(ORGANIZATION_STORAGE_KEY) || ''
}

const saveOrganizationId = (id) => {
  if (typeof sessionStorage === 'undefined') return
  if (id) sessionStorage.setItem(ORGANIZATION_STORAGE_KEY, id)
  else sessionStorage.removeItem(ORGANIZATION_STORAGE_KEY)
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [organizations, setOrganizations] = useState([])
  const [activeOrganizationId, setActiveOrganizationId] = useState(storedOrganizationId)
  const [loading, setLoading] = useState(true)
  const requestVersion = useRef(0)

  const acceptSession = useCallback((data) => {
    setUser(data.user)
    const items = data.organizations || []
    setOrganizations(items)
    const selected = items.some((item) => item.id === storedOrganizationId())
      ? storedOrganizationId()
      : items[0]?.id || ''
    saveOrganizationId(selected)
    setActiveOrganizationId(selected)
  }, [])

  const refreshSession = useCallback(async () => {
    const { data } = await getCurrentUser()
    const normalized = {
      user: data.user,
      organizations: data.organizations,
    }
    acceptSession(normalized)
    return data
  }, [acceptSession])

  useEffect(() => {
    const version = requestVersion.current
    getCurrentUser()
      .then(({ data }) => {
        if (version === requestVersion.current) acceptSession(data)
      })
      .catch(() => {
        if (version === requestVersion.current) {
          setUser(null)
          setOrganizations([])
          saveOrganizationId('')
          setActiveOrganizationId('')
        }
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false)
      })
  }, [acceptSession])

  const signIn = useCallback(async (credentials) => {
    requestVersion.current += 1
    const { data } = await loginAccount(credentials)
    acceptSession(data)
    setLoading(false)
    return data
  }, [acceptSession])

  const signUp = useCallback((payload) => registerAccount(payload), [])

  const signOut = useCallback(async () => {
    try {
      await logoutAccount()
    } catch (error) {
      if (error.status !== 401) throw error
    }
    requestVersion.current += 1
    setUser(null)
    setOrganizations([])
    setActiveOrganizationId('')
    saveOrganizationId('')
  }, [])

  const selectOrganization = useCallback(async (organizationId) => {
    if (!organizations.some((organization) => organization.id === organizationId)) {
      throw new Error('You do not belong to that organization.')
    }
    saveOrganizationId(organizationId)
    setActiveOrganizationId(organizationId)
    try {
      await refreshSession()
    } catch (error) {
      saveOrganizationId(activeOrganizationId)
      setActiveOrganizationId(activeOrganizationId)
      throw error
    }
  }, [activeOrganizationId, organizations, refreshSession])

  const value = useMemo(() => ({
    user,
    organizations,
    activeOrganizationId,
    activeOrganization: organizations.find((organization) => organization.id === activeOrganizationId) || null,
    loading,
    isAuthenticated: Boolean(user),
    signIn,
    signUp,
    signOut,
    refreshSession,
    selectOrganization,
  }), [user, organizations, activeOrganizationId, loading, signIn, signUp, signOut, refreshSession, selectOrganization])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
