import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { invalidateEntryData, useEntries, useOrgProfiles } from '../../hooks/useEntries'
import { useCategories, useFolders } from '../../hooks/useSpaceData'
import { fullName } from '../../hooks/useOrgData'
import { formatMoney } from '../../lib/format'
import { formatDate } from '../../lib/dates'
import { checkEntryWrite, filtersToSearch, hasActiveFilters, net, PAGE_SIZE, parseFilters } from '../../lib/entries'
import { SelectField, TextField } from '../../components/ui/Field'
import { Checkbox } from '../../components/ui/Checkbox'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import { EditEntryModal } from './EntryForm'

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'category', label: 'Category' },
  { key: 'amount', label: 'Amount' },
  { key: 'added_by', label: 'Added by' },
]

const SORT_OPTIONS = [
  { value: 'date:desc', label: 'Date, newest first' },
  { value: 'date:asc', label: 'Date, oldest first' },
  { value: 'amount:desc', label: 'Amount, largest first' },
  { value: 'amount:asc', label: 'Amount, smallest first' },
  { value: 'category:asc', label: 'Category, A to Z' },
  { value: 'category:desc', label: 'Category, Z to A' },
  { value: 'added_by:asc', label: 'Added by, A to Z' },
  { value: 'added_by:desc', label: 'Added by, Z to A' },
]

// Dates and amounts start newest/largest first, names A to Z.
const FIRST_DESC = { date: true, amount: true, category: false, added_by: false }

const actionClass = 'text-sm font-medium hover:underline'

function describe(entry, money) {
  return `${entry.category_name}, ${money(entry.amount)}, ${formatDate(entry.entry_date)}`
}

function CategoryFilter({ categories, selected, onChange }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-slate-300 ring-inset">
        <span>Categories{selected.length ? ` (${selected.length})` : ': all'}</span>
        <svg className="h-4 w-4 text-slate-400 group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </summary>
      <div className="absolute z-20 mt-1 max-h-72 w-full min-w-56 overflow-y-auto rounded-lg bg-white p-3 shadow-lg ring-1 ring-slate-200">
        {['expense', 'income'].map((type) => {
          const list = categories.filter((c) => c.type === type)
          if (!list.length) return null
          return (
            <fieldset key={type} className="mb-3 last:mb-0">
              <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{type === 'income' ? 'Income' : 'Expense'}</legend>
              <div className="space-y-1.5">
                {list.map((c) => (
                  <Checkbox key={c.id} label={c.archived_at ? `${c.name} (archived)` : c.name} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                ))}
              </div>
            </fieldset>
          )
        })}
        {!categories.length && <p className="text-sm text-slate-500">No categories.</p>}
      </div>
    </details>
  )
}

function Filters({ spaceId, filters, update, showFileFilter }) {
  const categoriesQuery = useCategories(spaceId)
  const profilesQuery = useOrgProfiles()
  const foldersQuery = useFolders(spaceId)
  const [open, setOpen] = useState(false)
  const active = hasActiveFilters(filters)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="entry-filters"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white sm:hidden"
      >
        {open ? 'Hide filters' : active ? 'Filters (on)' : 'Filters'}
      </button>
      <div id="entry-filters" role="group" aria-label="Filters" className={`${open ? 'grid' : 'hidden'} mt-3 grid-cols-1 gap-3 sm:mt-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 items-end`}>
        <TextField label="From" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        <TextField label="To" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        <div>
          <p className="mb-1.5 block text-sm font-medium text-slate-700" aria-hidden="true">
            Categories
          </p>
          <CategoryFilter categories={categoriesQuery.data ?? []} selected={filters.categoryIds} onChange={(categoryIds) => update({ categoryIds })} />
        </div>
        <SelectField label="Type" value={filters.type} onChange={(e) => update({ type: e.target.value })}>
          <option value="">All</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </SelectField>
        <SelectField label="Added by" value={filters.addedBy} onChange={(e) => update({ addedBy: e.target.value })}>
          <option value="">Anyone</option>
          {(profilesQuery.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)}
            </option>
          ))}
        </SelectField>
        {showFileFilter && (
          <SelectField label="File" value={filters.fileId} onChange={(e) => update({ fileId: e.target.value })}>
            <option value="">All files</option>
            {(foldersQuery.data ?? []).map((folder) => (
              <optgroup key={folder.id} label={folder.name}>
                {folder.files.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
        )}
      </div>
      {active && (
        <button
          type="button"
          onClick={() => update({ from: '', to: '', categoryIds: [], type: '', addedBy: '', fileId: '' })}
          className="mt-2 text-sm font-medium text-emerald-700 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

function SortHeader({ column, filters, onSort, className = '' }) {
  const current = filters.sort === column.key
  const ariaSort = current ? (filters.desc ? 'descending' : 'ascending') : 'none'
  return (
    <th role="columnheader" scope="col" aria-sort={ariaSort} className={`px-4 py-3 ${className}`}>
      <button type="button" onClick={() => onSort(column.key)} className="inline-flex items-center gap-1 uppercase hover:text-slate-800">
        {column.label}
        <span aria-hidden="true" className={current ? 'text-slate-700' : 'text-slate-300'}>
          {current && !filters.desc ? '▲' : '▼'}
        </span>
      </button>
    </th>
  )
}

// The entry list of a file (`fileId`) or, without it, of the whole space with a File column.
// Filters, sort and page are kept in the URL.
export default function EntriesTable({ space, fileId, canEdit }) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseFilters(searchParams)
  const entriesQuery = useEntries(space.id, filters, fileId)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const money = (n) => formatMoney(n, space.currency_code, space.currency_symbol)
  const spaceWide = !fileId

  // Changing a filter or the sort goes back to the first page.
  function update(changes, { keepPage = false } = {}) {
    const next = { ...filters, ...changes }
    if (!keepPage) next.page = 1
    setSearchParams(filtersToSearch(next), { replace: true })
  }

  function sortBy(key) {
    update({ sort: key, desc: filters.sort === key ? !filters.desc : FIRST_DESC[key] })
  }

  const data = entriesQuery.data
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1
  const firstRow = (filters.page - 1) * PAGE_SIZE + 1

  return (
    <section aria-labelledby="entries-title" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="entries-title" className="text-base font-semibold text-slate-900">
          Entries
        </h2>
        <div className="sm:hidden">
          <label htmlFor="entry-sort" className="sr-only">
            Sort by
          </label>
          <select
            id="entry-sort"
            value={`${filters.sort}:${filters.desc ? 'desc' : 'asc'}`}
            onChange={(e) => {
              const [sort, dir] = e.target.value.split(':')
              update({ sort, desc: dir === 'desc' })
            }}
            className="rounded-lg border-0 bg-white py-1.5 pr-8 pl-3 text-sm text-slate-700 ring-1 ring-slate-300 ring-inset"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <Filters spaceId={space.id} filters={filters} update={update} showFileFilter={spaceWide} />
      </div>

      <dl aria-label="Totals of the filtered entries" className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-slate-100 px-4 py-3 text-sm sm:flex sm:flex-wrap">
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Income</dt>
          <dd className="font-semibold text-emerald-700">{data ? money(data.income) : '…'}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Expense</dt>
          <dd className="font-semibold text-red-700">{data ? money(data.expense) : '…'}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Net</dt>
          <dd className={`font-semibold ${data && net(data.income, data.expense) < 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {data ? money(net(data.income, data.expense)) : '…'}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Entries</dt>
          <dd className="font-semibold text-slate-900">{data ? data.count : '…'}</dd>
        </div>
      </dl>

      {entriesQuery.isPending && <Spinner className="mt-4" label="Loading entries…" />}
      {entriesQuery.error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          Could not load entries. Reload the page to try again.
        </p>
      )}

      {data && data.rows.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {filters.page > 1 ? (
            <>
              This page is empty.{' '}
              <button type="button" onClick={() => update({}, {})} className="font-medium text-emerald-700 hover:underline">
                Go to the first page
              </button>
            </>
          ) : hasActiveFilters(filters) ? (
            'No entries match these filters.'
          ) : canEdit && !spaceWide ? (
            'No entries yet. Add the first one above.'
          ) : (
            'No entries yet.'
          )}
        </div>
      )}

      {data && data.rows.length > 0 && (
        // Rows are stacked as cards on phones and form a normal table from `sm` up; the explicit
        // ARIA roles keep table semantics when the display is changed.
        <div className={`mt-4 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 sm:overflow-x-auto ${entriesQuery.isPlaceholderData ? 'opacity-60' : ''}`}>
          <table role="table" aria-label="Entries" aria-busy={entriesQuery.isFetching || undefined} className="block w-full text-sm sm:table sm:min-w-full">
            <thead role="rowgroup" className="hidden bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 sm:table-header-group">
              <tr role="row">
                <SortHeader column={COLUMNS[0]} filters={filters} onSort={sortBy} className="rounded-tl-xl" />
                {spaceWide && (
                  <th role="columnheader" scope="col" className="px-4 py-3 uppercase">
                    File
                  </th>
                )}
                <SortHeader column={COLUMNS[1]} filters={filters} onSort={sortBy} />
                <th role="columnheader" scope="col" className="px-4 py-3 uppercase">
                  Type
                </th>
                <SortHeader column={COLUMNS[2]} filters={filters} onSort={sortBy} className="text-right" />
                <th role="columnheader" scope="col" className="px-4 py-3 uppercase">
                  Note
                </th>
                <SortHeader column={COLUMNS[3]} filters={filters} onSort={sortBy} className={canEdit ? '' : 'rounded-tr-xl'} />
                {canEdit && (
                  <th role="columnheader" scope="col" className="rounded-tr-xl px-4 py-3 text-right uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody role="rowgroup" className="block divide-y divide-slate-100 sm:table-row-group">
              {data.rows.map((entry) => (
                <tr key={entry.id} role="row" className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 sm:table-row sm:p-0">
                  <td role="cell" className="text-slate-500 sm:table-cell sm:whitespace-nowrap sm:px-4 sm:py-3 sm:text-slate-700">
                    {formatDate(entry.entry_date)}
                  </td>
                  {spaceWide && (
                    <td role="cell" className="col-span-2 row-start-3 sm:table-cell sm:px-4 sm:py-3">
                      <span className="sr-only sm:hidden">File: </span>
                      <Link to={`/spaces/${space.id}/files/${entry.file_id}`} className="text-emerald-700 hover:underline">
                        {entry.file_name}
                      </Link>
                    </td>
                  )}
                  <td role="cell" className="row-start-2 sm:table-cell sm:px-4 sm:py-3">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.category_color }} />
                      {entry.category_name}
                    </span>
                  </td>
                  <td role="cell" className="row-start-2 justify-self-end sm:table-cell sm:px-4 sm:py-3">
                    <Badge tone={entry.type === 'income' ? 'green' : 'red'}>{entry.type === 'income' ? 'Income' : 'Expense'}</Badge>
                  </td>
                  <td
                    role="cell"
                    className={`col-start-2 row-start-1 text-right font-semibold whitespace-nowrap tabular-nums sm:table-cell sm:px-4 sm:py-3 ${
                      entry.type === 'income' ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {money(entry.amount)}
                  </td>
                  <td role="cell" className="col-span-2 text-slate-600 sm:table-cell sm:max-w-xs sm:truncate sm:px-4 sm:py-3" title={entry.note ?? undefined}>
                    {entry.note}
                  </td>
                  <td role="cell" className="col-span-2 text-xs text-slate-500 sm:table-cell sm:px-4 sm:py-3 sm:text-sm sm:whitespace-nowrap sm:text-slate-700">
                    <span className="sm:hidden">Added by </span>
                    {entry.created_by ? entry.created_by_name : 'Deleted user'}
                  </td>
                  {canEdit && (
                    <td role="cell" className="col-span-2 mt-1 sm:table-cell sm:mt-0 sm:px-4 sm:py-3 sm:text-right sm:whitespace-nowrap">
                      <div className="flex gap-5 sm:justify-end sm:gap-4">
                        <button type="button" className={`${actionClass} text-emerald-700`} onClick={() => setEditing(entry)} aria-label={`Edit entry: ${describe(entry, money)}`}>
                          Edit
                        </button>
                        <button type="button" className={`${actionClass} text-red-700`} onClick={() => setDeleting(entry)} aria-label={`Delete entry: ${describe(entry, money)}`}>
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.count > 0 && (
        <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            {firstRow}–{Math.min(firstRow + data.rows.length - 1, data.count)} of {data.count}
          </p>
          {pages > 1 && (
            <div className="flex items-center gap-3">
              <Button variant="secondary" className="w-auto py-1.5" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 }, { keepPage: true })}>
                Previous
              </Button>
              <span>
                Page {filters.page} of {pages}
              </span>
              <Button variant="secondary" className="w-auto py-1.5" disabled={filters.page >= pages} onClick={() => update({ page: filters.page + 1 }, { keepPage: true })}>
                Next
              </Button>
            </div>
          )}
        </nav>
      )}

      {editing && <EditEntryModal space={space} entry={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this entry?"
        description={deleting ? `${describe(deleting, money)}. This can't be undone.` : undefined}
        confirmLabel="Delete entry"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await checkEntryWrite(supabase.from('entries').delete().eq('id', deleting.id).select('id'))
          // Deleting the only row on the last page would leave it empty.
          if (data.rows.length === 1 && filters.page > 1) update({ page: filters.page - 1 }, { keepPage: true })
          setDeleting(null)
          await invalidateEntryData(queryClient, space.id)
        }}
      />
    </section>
  )
}
