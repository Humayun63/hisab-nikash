import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../auth/AuthProvider'
import { useSpace } from '../../hooks/useOrgData'
import { useFolders } from '../../hooks/useSpaceData'
import { useOrgToday } from '../../hooks/useEntries'
import { useDashboardByCategory, useDashboardSummary, useDashboardTrend, useRecentEntries } from '../../hooks/useDashboard'
import { formatMoney } from '../../lib/format'
import { formatDate } from '../../lib/dates'
import { filtersToSearch, net } from '../../lib/entries'
import { percentChange, periodRange, PERIODS, trendBucket } from '../../lib/periods'
import { TextField } from '../../components/ui/Field'
import Spinner from '../../components/ui/Spinner'
import useDocumentTitle from '../../components/ui/useDocumentTitle'

const INCOME_COLOR = '#059669'
const EXPENSE_COLOR = '#dc2626'
const UUID = /^[0-9a-f-]{36}$/i

// Dashboard state lives in the URL: ?period=month, ?period=custom&from=…&to=…, ?scope=folder:<id>|file:<id>.
function readState(searchParams, today, weekStart) {
  const period = PERIODS.some((p) => p.value === searchParams.get('period')) ? searchParams.get('period') : 'today'
  const custom = { from: searchParams.get('from') ?? '', to: searchParams.get('to') ?? '' }
  const range = periodRange(period, today, weekStart, custom)
  const [kind, id] = (searchParams.get('scope') ?? '').split(':')
  const scope = UUID.test(id ?? '') && (kind === 'folder' || kind === 'file') ? { kind, id } : null
  return {
    period,
    ...range,
    scope,
    folderId: scope?.kind === 'folder' ? scope.id : '',
    fileId: scope?.kind === 'file' ? scope.id : '',
  }
}

function bucketLabel(iso, bucket) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (bucket === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return bucket === 'week' ? `Week of ${day}` : day
}

function Change({ current, previous, goodWhenUp }) {
  const change = percentChange(current, previous)
  if (change === null) return <p className="mt-1 text-xs text-slate-500">No data for the previous period</p>
  const rounded = Math.round(change)
  if (rounded === 0) return <p className="mt-1 text-xs text-slate-500">Same as the previous period</p>
  const up = rounded > 0
  const good = up === goodWhenUp
  return (
    <p className={`mt-1 text-xs font-medium ${good ? 'text-emerald-700' : 'text-red-700'}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'} </span>
      {up ? 'Up' : 'Down'} {Math.abs(rounded)}% on the previous period
    </p>
  )
}

function SummaryCard({ label, value, tone, change }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd>
        <p className={`mt-1 text-xl font-semibold ${tone}`}>{value}</p>
        {change}
      </dd>
    </div>
  )
}

function CategoryBreakdown({ title, rows, money, entriesLink }) {
  const navigate = useNavigate()
  const total = rows.reduce((n, r) => n + r.total, 0)
  return (
    <section aria-labelledby={`${title}-title`} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 id={`${title}-title`} className="text-sm font-semibold text-slate-900">
        {title} by category
      </h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No {title.toLowerCase()} in this period.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 items-center gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          {/* The table below shows the same numbers as text. */}
          <div className="mx-auto h-40 w-40" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="total" nameKey="name" innerRadius="60%" outerRadius="100%" isAnimationActive={false}>
                  {rows.map((r) => (
                    <Cell key={r.category_id} fill={r.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="py-1.5 font-semibold">Category</th>
                <th scope="col" className="py-1.5 text-right font-semibold">Amount</th>
                <th scope="col" className="py-1.5 text-right font-semibold">%</th>
                <th scope="col" className="py-1.5 text-right font-semibold">Entries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.category_id} onClick={() => navigate(entriesLink(r.category_id))} className="cursor-pointer hover:bg-slate-50">
                  <td className="py-2 pr-2">
                    <Link to={entriesLink(r.category_id)} className="inline-flex items-center gap-2 text-slate-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap tabular-nums">{money(r.total)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{total ? Math.round((r.total / total) * 100) : 0}%</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{r.entry_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TrendChart({ data, bucket, money }) {
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
  const rows = data.map((d) => ({ ...d, label: bucketLabel(d.bucket, bucket) }))
  const empty = rows.every((r) => !r.income && !r.expense)
  return (
    <section aria-labelledby="trend-title" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 id="trend-title" className="text-sm font-semibold text-slate-900">
        Income and expense {bucket === 'month' ? 'per month' : bucket === 'week' ? 'per week' : 'per day'}
      </h2>
      {empty ? (
        <p className="mt-4 text-sm text-slate-500">No entries in this period.</p>
      ) : (
        <>
          <div className="mt-3 h-64" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => compact.format(v)} width={44} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill={INCOME_COLOR} isAnimationActive={false} />
                <Bar dataKey="expense" name="Expense" fill={EXPENSE_COLOR} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-emerald-700 hover:underline">Show as a table</summary>
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="w-full">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="py-1">Period</th>
                    <th scope="col" className="py-1 text-right">Income</th>
                    <th scope="col" className="py-1 text-right">Expense</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.bucket}>
                      <td className="py-1">{r.label}</td>
                      <td className="py-1 text-right tabular-nums">{money(r.income)}</td>
                      <td className="py-1 text-right tabular-nums">{money(r.expense)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  )
}

function RecentEntries({ spaceId, scope, money }) {
  const query = useRecentEntries(spaceId, scope)
  return (
    <section aria-labelledby="recent-title" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="recent-title" className="text-sm font-semibold text-slate-900">
          Recent entries
        </h2>
        <Link to={`/spaces/${spaceId}/entries`} className="text-sm font-medium text-emerald-700 hover:underline">
          All entries
        </Link>
      </div>
      {query.isPending && <Spinner className="mt-3" label="Loading…" />}
      {query.error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          Could not load recent entries.
        </p>
      )}
      {query.data?.length === 0 && <p className="mt-3 text-sm text-slate-500">No entries yet.</p>}
      {query.data?.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {query.data.map((e) => (
            <li key={e.id}>
              <Link to={`/spaces/${spaceId}/files/${e.file_id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-slate-50">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.category_color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{e.category_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {formatDate(e.entry_date)} · {e.file_name}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${e.type === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {e.type === 'income' ? '+' : '−'}
                  {money(e.amount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function DashboardPage() {
  const { spaceId } = useParams()
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const today = useOrgToday()
  const { data: space } = useSpace(spaceId)
  const foldersQuery = useFolders(spaceId)
  const state = readState(searchParams, today, profile?.organization?.week_start ?? 6)
  const bucket = trendBucket(state.period, state.from, state.to)
  const summary = useDashboardSummary(spaceId, state)
  const byCategory = useDashboardByCategory(spaceId, state)
  const trend = useDashboardTrend(spaceId, state, bucket)
  useDocumentTitle(space ? `${space.name} dashboard` : 'Dashboard')

  if (!space) return <Spinner label="Loading dashboard…" />

  const money = (n) => formatMoney(n, space.currency_code, space.currency_symbol)

  function set(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next, { replace: true })
  }

  const entriesLink = (categoryId) =>
    `/spaces/${spaceId}/entries?${filtersToSearch({
      from: state.from,
      to: state.to,
      categoryIds: [categoryId],
      fileId: state.fileId,
      folderId: state.folderId,
    })}`

  const s = summary.data
  const categories = byCategory.data ?? []
  const anyError = summary.error || byCategory.error || trend.error

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-600">
        {state.from === state.to ? formatDate(state.from) : `${formatDate(state.from)} – ${formatDate(state.to)}`}. Only categories you can see are included.
      </p>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={state.period === p.value}
              onClick={() =>
                set(p.value === 'custom' ? { period: 'custom', from: state.from, to: state.to } : { period: p.value === 'today' ? '' : p.value, from: '', to: '' })
              }
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                state.period === p.value ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="sm:w-64">
          <label htmlFor="dashboard-scope" className="mb-1.5 block text-sm font-medium text-slate-700">
            Scope
          </label>
          <select
            id="dashboard-scope"
            value={state.scope ? `${state.scope.kind}:${state.scope.id}` : ''}
            onChange={(e) => set({ scope: e.target.value })}
            className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Whole space</option>
            {(foldersQuery.data ?? []).map((folder) => (
              <optgroup key={folder.id} label={folder.name}>
                <option value={`folder:${folder.id}`}>All of {folder.name}</option>
                {folder.files.map((file) => (
                  <option key={file.id} value={`file:${file.id}`}>
                    {file.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {state.period === 'custom' && (
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
          <TextField label="From" type="date" value={state.from} max={today} onChange={(e) => e.target.value && set({ from: e.target.value })} />
          <TextField label="To" type="date" value={state.to} max={today} onChange={(e) => e.target.value && set({ to: e.target.value })} />
        </div>
      )}

      {anyError && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          Could not load some of the dashboard. Reload the page to try again.
        </p>
      )}

      <dl aria-label="Summary" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Expense"
          value={s ? money(s.expense) : '…'}
          tone="text-red-700"
          change={s && <Change current={s.expense} previous={s.prevExpense} goodWhenUp={false} />}
        />
        <SummaryCard
          label="Income"
          value={s ? money(s.income) : '…'}
          tone="text-emerald-700"
          change={s && <Change current={s.income} previous={s.prevIncome} goodWhenUp />}
        />
        <SummaryCard
          label="Net"
          value={s ? money(net(s.income, s.expense)) : '…'}
          tone={s && net(s.income, s.expense) < 0 ? 'text-red-700' : 'text-slate-900'}
          change={s && <Change current={s.net} previous={s.prevNet} goodWhenUp />}
        />
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CategoryBreakdown title="Expense" rows={categories.filter((c) => c.type === 'expense')} money={money} entriesLink={entriesLink} />
        <CategoryBreakdown title="Income" rows={categories.filter((c) => c.type === 'income')} money={money} entriesLink={entriesLink} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {trend.data ? <TrendChart data={trend.data} bucket={bucket} money={money} /> : <Spinner label="Loading chart…" />}
        <RecentEntries spaceId={spaceId} scope={state} money={money} />
      </div>
    </>
  )
}
