import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useSpace, useSpaceMembers } from '../../hooks/useOrgData'
import { ROLE_LABELS } from '../../lib/roles'
import Spinner from '../../components/ui/Spinner'
import useDocumentTitle from '../../components/ui/useDocumentTitle'

// Space overview. The dashboard, folders and entries for a space arrive in later milestones.
export default function SpacePage() {
  const { spaceId } = useParams()
  const { profile } = useAuth()
  const spaceQuery = useSpace(spaceId)
  const membersQuery = useSpaceMembers(spaceId)
  const space = spaceQuery.data
  useDocumentTitle(space?.name ?? 'Space')

  if (spaceQuery.isPending) return <Spinner label="Loading space…" />
  if (spaceQuery.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Could not load this space. Check your connection and reload the page.
      </p>
    )
  }
  if (!space) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Space not found</h1>
        <p className="mt-1 text-sm text-slate-600">It may have been deleted, or you don&apos;t have access to it.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  const myRole = profile.is_super_admin
    ? 'super_admin'
    : membersQuery.data?.find((m) => m.user_id === profile.id)?.role

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{space.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {space.currency_symbol} {space.currency_code}
            {myRole && ` · Your role: ${ROLE_LABELS[myRole]}`}
          </p>
          {space.description && <p className="mt-2 max-w-2xl text-sm text-slate-600">{space.description}</p>}
        </div>
        {profile.is_super_admin && (
          <Link
            to={`/spaces/${space.id}/settings`}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white"
          >
            Space settings
          </Link>
        )}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        The dashboard, folders and entries for this space are coming in the next milestones.
      </div>
    </>
  )
}
