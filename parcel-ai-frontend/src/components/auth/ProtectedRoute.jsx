import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-600" role="status">Checking your secure session…</div>
  }
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  return children || <Outlet />
}

export default ProtectedRoute
