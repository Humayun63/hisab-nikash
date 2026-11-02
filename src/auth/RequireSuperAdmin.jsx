import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'

// Inside RequireReady: only the super admin may open these pages.
export default function RequireSuperAdmin() {
  const { profile } = useAuth()
  if (!profile?.is_super_admin) return <Navigate to="/" replace />
  return <Outlet />
}
