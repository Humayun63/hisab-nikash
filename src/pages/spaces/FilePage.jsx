import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useSpace } from '../../hooks/useOrgData'
import { useFileTotals, useFolders, useSpaceRole } from '../../hooks/useSpaceData'
import { hasRole } from '../../lib/roles'
import { formatMoney } from '../../lib/format'
import { structureErrorMessage } from '../../lib/structureErrors'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import NameModal from '../../components/ui/NameModal'
import Spinner from '../../components/ui/Spinner'
import useDocumentTitle from '../../components/ui/useDocumentTitle'

function Total({ label, value, tone }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold ${tone}`}>{value}</dd>
    </div>
  )
}

export default function FilePage() {
  const { spaceId, fileId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: space } = useSpace(spaceId)
  const foldersQuery = useFolders(spaceId)
  const totalsQuery = useFileTotals(spaceId)
  const { role } = useSpaceRole(spaceId)
  const [action, setAction] = useState(null)

  const folder = foldersQuery.data?.find((f) => f.files.some((file) => file.id === fileId))
  const file = folder?.files.find((f) => f.id === fileId)
  useDocumentTitle(file?.name ?? 'File')

  if (foldersQuery.isPending || !space) return <Spinner label="Loading file…" />
  if (foldersQuery.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Could not load this file.
      </p>
    )
  }
  if (!file) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">File not found</h1>
        <p className="mt-1 text-sm text-slate-600">It may have been deleted.</p>
        <Link to={`/spaces/${spaceId}`} className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
          Back to {space.name}
        </Link>
      </div>
    )
  }

  const totals = totalsQuery.data?.[file.id] ?? { income: 0, expense: 0, net: 0, entryCount: 0 }
  const money = (n) => formatMoney(n, space.currency_code, space.currency_symbol)
  const canManage = hasRole(role, 'admin')
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['folders', spaceId] }),
      queryClient.invalidateQueries({ queryKey: ['file-totals', spaceId] }),
    ])

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        {folder.name} / <span className="text-slate-700">{file.name}</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">{file.name}</h1>
        {canManage && (
          <div className="flex gap-4 text-sm font-medium">
            <button type="button" onClick={() => setAction('rename')} className="text-emerald-700 hover:underline">
              Rename file
            </button>
            <button type="button" onClick={() => setAction('delete')} className="text-red-700 hover:underline">
              Delete file
            </button>
          </div>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="File totals">
        <Total label="Income" value={money(totals.income)} tone="text-emerald-700" />
        <Total label="Expense" value={money(totals.expense)} tone="text-red-700" />
        <Total label="Net" value={money(totals.net)} tone={totals.net < 0 ? 'text-red-700' : 'text-slate-900'} />
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        {totals.entryCount} {totals.entryCount === 1 ? 'entry' : 'entries'}. Totals only include categories you can see.
      </p>

      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        Adding and listing entries in this file is coming in the next milestone.
      </div>

      <NameModal
        open={action === 'rename'}
        title="Rename file"
        label="File name"
        initialName={file.name}
        submitLabel="Save"
        onClose={() => setAction(null)}
        onSubmit={async (name) => {
          const { error } = await supabase.from('files').update({ name }).eq('id', file.id)
          if (error) throw new Error(structureErrorMessage(error, 'file'))
          await refresh()
          setAction(null)
        }}
      />
      <ConfirmDialog
        open={action === 'delete'}
        title={`Delete ${file.name}?`}
        description="All entries in this file will be permanently deleted."
        confirmLabel="Delete file"
        onClose={() => setAction(null)}
        onConfirm={async () => {
          const { error } = await supabase.from('files').delete().eq('id', file.id)
          if (error) throw new Error(structureErrorMessage(error, 'file'))
          navigate(`/spaces/${spaceId}`, { replace: true })
          await refresh()
        }}
      />
    </>
  )
}
