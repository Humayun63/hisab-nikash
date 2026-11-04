import { NO_ROWS_MESSAGE } from './structureErrors'

// Entry list filters live in the URL (?from=…&cat=…&sort=…) so a filtered view can be linked to,
// e.g. from the dashboard (SPEC.md §5.8).

export const PAGE_SIZE = 50
export const SORTS = ['date', 'category', 'amount', 'added_by']
const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// URLSearchParams → filters, ignoring anything malformed.
export function parseFilters(searchParams) {
  const get = (key) => searchParams.get(key) ?? ''
  const page = Number.parseInt(get('page'), 10)
  return {
    from: DATE.test(get('from')) ? get('from') : '',
    to: DATE.test(get('to')) ? get('to') : '',
    categoryIds: searchParams.getAll('cat').filter((id) => UUID.test(id)),
    type: ['income', 'expense'].includes(get('type')) ? get('type') : '',
    addedBy: UUID.test(get('by')) ? get('by') : '',
    fileId: UUID.test(get('file')) ? get('file') : '',
    sort: SORTS.includes(get('sort')) ? get('sort') : 'date',
    // Every column starts descending (newest, largest, Z→A) except when ?dir=asc.
    desc: get('dir') !== 'asc',
    page: page > 0 ? page : 1,
  }
}

// Filters → URLSearchParams, leaving out defaults so URLs stay short.
export function filtersToSearch(filters) {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  for (const id of filters.categoryIds ?? []) params.append('cat', id)
  if (filters.type) params.set('type', filters.type)
  if (filters.addedBy) params.set('by', filters.addedBy)
  if (filters.fileId) params.set('file', filters.fileId)
  if (filters.sort && filters.sort !== 'date') params.set('sort', filters.sort)
  if (filters.desc === false) params.set('dir', 'asc')
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export function hasActiveFilters(filters) {
  return Boolean(filters.from || filters.to || filters.categoryIds.length || filters.type || filters.addedBy || filters.fileId)
}

// Arguments for the space_entries RPC. `fileId` (the file page) overrides the File filter.
export function entriesRpcArgs(spaceId, filters, fileId) {
  return {
    p_space_id: spaceId,
    p_file_id: fileId || filters.fileId || null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_category_ids: filters.categoryIds.length ? filters.categoryIds : null,
    p_type: filters.type || null,
    p_created_by: filters.addedBy || null,
    p_sort: filters.sort,
    p_desc: filters.desc,
    p_limit: PAGE_SIZE,
    p_offset: (filters.page - 1) * PAGE_SIZE,
  }
}

// Rounds to cents so float noise can't show "-0.00"; `|| 0` turns -0 into 0.
export function net(income, expense) {
  return Math.round((income - expense) * 100) / 100 || 0
}

// Database errors from entry writes → messages for the user.
export function entryErrorMessage(error) {
  if (!error) return null
  const message = error.message ?? ''
  if (error.code === '23514' && /future/.test(message)) return 'The date can\'t be in the future.'
  if (error.code === '23514' && /archived/.test(message)) return 'This category is archived. Choose another one.'
  if (error.code === '23514' || error.code === '22003') return 'Check the amount, date and note, then try again.'
  if (error.code === '23503') return 'The file or category no longer exists. Reload the page and try again.'
  if (error.code === '42501') return 'You don\'t have permission to do that.'
  return message || 'Something went wrong. Please try again.'
}

// Throws a user-facing Error for a failed entry write, or an update/delete (with .select())
// that RLS filtered out.
export async function checkEntryWrite(promise) {
  const { data, error } = await promise
  if (error) throw new Error(entryErrorMessage(error))
  if (Array.isArray(data) && data.length === 0) throw new Error(NO_ROWS_MESSAGE)
  return data
}

// Category options for the entry form: visible, not archived (except `keepId`, the category an
// edited entry already has, which the database still allows).
export function categoryOptions(categories, keepId) {
  return (categories ?? [])
    .filter((c) => !c.archived_at || c.id === keepId)
    .map((c) => ({ value: c.id, label: c.archived_at ? `${c.name} (archived)` : c.name, group: c.type, color: c.color }))
}

export const CATEGORY_GROUPS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
]
