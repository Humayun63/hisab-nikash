import { Navigate, Outlet, useParams } from 'react-router-dom'
import { useSpaceRole } from '../hooks/useSpaceData'
import { hasRole } from '../lib/roles'
import Spinner from '../components/ui/Spinner'

// Inside a space: only users with at least `min` role may open these pages; others go to the
// space overview. (The database enforces the same rules.)
export default function RequireSpaceRole({ min }) {
  const { spaceId } = useParams()
  const { role, isPending } = useSpaceRole(spaceId)
  if (isPending) return <Spinner label="Loading…" />
  if (!hasRole(role, min)) return <Navigate to={`/spaces/${spaceId}`} replace />
  return <Outlet />
}
