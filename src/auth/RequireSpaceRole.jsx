import { Navigate, Outlet, useParams } from 'react-router-dom'
import { useSpaceRole } from '../hooks/useSpaceData'
import { hasRole } from '../lib/roles'
import Spinner from '../components/ui/Spinner'

// Inside a space: only users with at least `min` role may open these pages; others go to the
// space overview. (The database enforces the same rules.)
export default function RequireSpaceRole({ min }) {
  const { spaceId } = useParams()
  const { role, isPending, error } = useSpaceRole(spaceId)
  if (isPending) return <Spinner label="Loading…" />
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Could not load your access to this space. Reload the page to try again.
      </p>
    )
  }
  if (!hasRole(role, min)) return <Navigate to={`/spaces/${spaceId}`} replace />
  return <Outlet />
}
