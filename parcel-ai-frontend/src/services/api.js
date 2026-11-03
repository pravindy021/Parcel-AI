import axios from 'axios'

const configuredApiPrefix = import.meta.env.VITE_API_PREFIX?.trim() || '/api'
const apiPrefixPath = configuredApiPrefix.replace(/^\/+|\/+$/g, '')
export const API_PREFIX = apiPrefixPath ? `/${apiPrefixPath}` : '/api'

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
).replace(/\/+$/, '')

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  withCredentials: true,
})

const getCookie = (name) => {
  if (typeof document === 'undefined') return ''
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : ''
}

api.interceptors.request.use((config) => {
  const csrfToken = getCookie('parcel_ai_csrf')
  if (csrfToken) config.headers.set('X-CSRF-Token', csrfToken)
  if (typeof sessionStorage !== 'undefined') {
    const organizationId = sessionStorage.getItem('parcel-ai-organization-id')
    if (organizationId) config.headers.set('X-Organization-ID', organizationId)
  }
  return config
})

const statusMessages = {
  400: 'The request could not be processed. Check the supplied data and try again.',
  401: 'Authentication is required to complete this request.',
  403: 'You do not have permission to complete this request.',
  404: 'The requested resource was not found.',
  413: 'The uploaded file is larger than the server allows.',
  422: 'Some of the supplied data is invalid.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'The server encountered an error. Please try again later.',
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const detail = error.response?.data?.detail
    const detailMessage = Array.isArray(detail)
      ? detail.map((item) => item.msg).filter(Boolean).join(' ')
      : typeof detail === 'string'
        ? detail
        : ''
    const containsInternalDetails = /traceback|file ["']|(?:[a-z]:[\\/]|(?:^|\s)\/(?:home|tmp|var|etc|usr|opt|app|workspace)\/)/i.test(detailMessage)
    const message = containsInternalDetails
      ? statusMessages[status] || 'The server could not complete the request.'
      : detailMessage ||
        statusMessages[status] ||
        (error.code === 'ECONNABORTED'
          ? 'The request timed out. Please try again.'
          : error.response
            ? 'The server could not complete the request.'
            : 'Unable to reach the backend. Check that the API is running and try again.')

    const apiError = new Error(message)
    apiError.status = status
    return Promise.reject(apiError)
  },
)

export const getHealth = () => api.get('/health')
export const getBackendConfig = () => api.get(`${API_PREFIX}/config`)
export const getDatasets = () => api.get(`${API_PREFIX}/datasets`)
export const getDataset = (id) => api.get(`${API_PREFIX}/datasets/${encodeURIComponent(id)}`)
export const deleteDataset = (id) => api.delete(`${API_PREFIX}/datasets/${encodeURIComponent(id)}`)

export const uploadDataset = (formData, onUploadProgress) =>
  api.post(`${API_PREFIX}/datasets/upload`, formData, { onUploadProgress })

export const getDatasetPreview = (id, limit = 50) =>
  api.get(`${API_PREFIX}/datasets/${encodeURIComponent(id)}/preview`, { params: { limit } })

export const getDatasetColumns = (id) =>
  api.get(`${API_PREFIX}/datasets/${encodeURIComponent(id)}/columns`)

export const saveDatasetMapping = (id, mapping) =>
  api.put(`${API_PREFIX}/datasets/${encodeURIComponent(id)}/mapping`, { mapping })

export const validateDataset = (id) =>
  api.post(`${API_PREFIX}/datasets/${encodeURIComponent(id)}/validate`)

export const getDatasetValidation = (id) =>
  api.get(`${API_PREFIX}/datasets/${encodeURIComponent(id)}/validation`)

export const analyzeDataset = (id) =>
  api.post(`${API_PREFIX}/datasets/${encodeURIComponent(id)}/analyze`)

export const getDatasetAnalysis = (id) =>
  api.get(`${API_PREFIX}/datasets/${encodeURIComponent(id)}/analysis`)

export const trainModel = (payload) => api.post(`${API_PREFIX}/models/train`, payload)
export const getModels = () => api.get(`${API_PREFIX}/models`)
export const predictShipment = (payload) => api.post(`${API_PREFIX}/predictions`, payload)
export const getPredictions = () => api.get(`${API_PREFIX}/predictions`)
export const getReport = (id) => api.get(`${API_PREFIX}/reports/${encodeURIComponent(id)}`)
export const downloadReport = (id) => api.get(`${API_PREFIX}/reports/${encodeURIComponent(id)}/download`)
export const registerAccount = (payload) => api.post(`${API_PREFIX}/auth/register`, payload)
export const loginAccount = (payload) => api.post(`${API_PREFIX}/auth/login`, payload)
export const logoutAccount = () => api.post(`${API_PREFIX}/auth/logout`)
export const getCurrentUser = () => api.get(`${API_PREFIX}/auth/me`)
export const updateProfile = (payload) => api.patch(`${API_PREFIX}/auth/me`, payload)
export const changePassword = (payload) => api.post(`${API_PREFIX}/auth/change-password`, payload)
export const verifyEmail = (token) => api.post(`${API_PREFIX}/auth/verify-email`, { token })
export const requestPasswordReset = (email) => api.post(`${API_PREFIX}/auth/forgot-password`, { email })
export const resetPassword = (payload) => api.post(`${API_PREFIX}/auth/reset-password`, payload)
export const resendVerification = (email) => api.post(`${API_PREFIX}/auth/resend-verification`, { email })
export const listOrganizations = () => api.get(`${API_PREFIX}/organizations`)
export const createOrganization = (payload) => api.post(`${API_PREFIX}/organizations`, payload)
export const getOrganizationMembers = (organizationId) =>
  api.get(`${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/members`)
export const getOrganizationInvitations = (organizationId) =>
  api.get(`${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/invitations`)
export const inviteOrganizationMember = (organizationId, payload) =>
  api.post(`${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/invitations`, payload)
export const revokeOrganizationInvitation = (organizationId, invitationId) =>
  api.post(`${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationId)}/revoke`)
export const updateOrganizationMemberRole = (organizationId, membershipId, role) =>
  api.patch(`${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(membershipId)}`, { role })
export const removeOrganizationMember = (organizationId, membershipId) =>
  api.delete(`${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(membershipId)}`)
export const acceptOrganizationInvitation = (token) =>
  api.post(`${API_PREFIX}/organizations/invitations/accept`, { token })
export const getOrganizationWorkspaces = (organizationId) =>
  api.get(`${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/workspaces`)
export const createOrganizationWorkspace = (organizationId, payload) =>
  api.post(`${API_PREFIX}/organizations/${encodeURIComponent(organizationId)}/workspaces`, payload)

export default api
