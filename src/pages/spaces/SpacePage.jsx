import { Link, useParams } from 'react-router-dom'
import { useSpace } from '../../hooks/useOrgData'
import { useCategories, useFolders, useSpaceRole } from '../../hooks/useSpaceData'
import { hasRole } from '../../lib/roles'
import useDocumentTitle from '../../components/ui/useDocumentTitle'

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{value ?? '…'}</dd>
    </div>
  )
}

// Space overview inside SpaceLayout. The dashboard replaces it in milestone 6.
export default function SpacePage() {
  const { spaceId } = useParams()
  const { data: space } = useSpace(spaceId)
  const foldersQuery = useFolders(spaceId)
  const categoriesQuery = useCategories(spaceId)
  const { role } = useSpaceRole(spaceId)
  useDocumentTitle(space?.name ?? 'Space')
  if (!space) return null

  const folders = foldersQuery.data
  const fileCount = folders?.reduce((n, f) => n + f.files.length, 0)
  const canManage = hasRole(role, 'admin')

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
      {space.description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{space.description}</p>}

      <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Folders" value={folders?.length} />
        <Stat label="Files" value={fileCount} />
        <Stat label="Categories" value={categoriesQuery.data?.length} />
      </dl>

      {canManage && folders?.length === 0 && (
        <p className="mt-6 text-sm text-slate-600">
          Start by creating a folder (use <span className="font-medium">New folder</span> in the menu), then add files to it
          {categoriesQuery.data?.length === 0 && (
            <>
              {' '}and set up your{' '}
              <Link to={`/spaces/${space.id}/categories`} className="font-medium text-emerald-700 hover:underline">
                categories
              </Link>
            </>
          )}
          .
        </p>
      )}

      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        The dashboard for this space is coming in a later milestone.
      </div>
    </>
  )
}
