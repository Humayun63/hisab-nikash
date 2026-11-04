import { useParams } from 'react-router-dom'
import { useSpace } from '../../hooks/useOrgData'
import { useSpaceRole } from '../../hooks/useSpaceData'
import { hasRole } from '../../lib/roles'
import Spinner from '../../components/ui/Spinner'
import useDocumentTitle from '../../components/ui/useDocumentTitle'
import EntriesTable from './EntriesTable'

// Every entry in the space, across files (SPEC.md §5.7). Entries are added from a file page.
export default function SpaceEntriesPage() {
  const { spaceId } = useParams()
  const { data: space } = useSpace(spaceId)
  const { role } = useSpaceRole(spaceId)
  useDocumentTitle('All entries')

  if (!space) return <Spinner label="Loading entries…" />

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">All entries</h1>
      <p className="mt-1 text-sm text-slate-600">Every file in {space.name}. To add an entry, open a file. Only categories you can see are included.</p>
      <EntriesTable space={space} canEdit={hasRole(role, 'editor')} />
    </>
  )
}
