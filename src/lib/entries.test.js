import { describe, expect, it } from 'vitest'
import {
  categoryOptions,
  checkEntryWrite,
  entriesRpcArgs,
  entryErrorMessage,
  filtersToSearch,
  hasActiveFilters,
  net,
  PAGE_SIZE,
  parseFilters,
} from './entries'
import { NO_ROWS_MESSAGE } from './structureErrors'

const CAT_A = 'a0000000-0000-4000-8000-000000000001'
const CAT_B = 'a0000000-0000-4000-8000-000000000002'
const USER = 'b0000000-0000-4000-8000-000000000001'
const FILE = 'c0000000-0000-4000-8000-000000000001'
const FOLDER = 'd0000000-0000-4000-8000-000000000001'

const defaults = {
  from: '',
  to: '',
  categoryIds: [],
  type: '',
  addedBy: '',
  fileId: '',
  folderId: '',
  sort: 'date',
  desc: true,
  page: 1,
}

describe('parseFilters', () => {
  it('returns defaults for empty params', () => {
    expect(parseFilters(new URLSearchParams(''))).toEqual(defaults)
  })

  it('reads valid values', () => {
    const params = new URLSearchParams(`from=2026-01-01&to=2026-02-28&cat=${CAT_A}&type=expense&by=${USER}&file=${FILE}&sort=amount&dir=asc&page=3`)
    expect(parseFilters(params)).toEqual({
      from: '2026-01-01',
      to: '2026-02-28',
      categoryIds: [CAT_A],
      type: 'expense',
      addedBy: USER,
      fileId: FILE,
      folderId: '',
      sort: 'amount',
      desc: false,
      page: 3,
    })
  })

  it('ignores malformed dates, ids, type and sort', () => {
    const params = new URLSearchParams('from=yesterday&to=2026/11/04&type=other&by=not-a-uuid&file=123&folder=abc&sort=bogus')
    const f = parseFilters(params)
    expect(f.from).toBe('')
    expect(f.to).toBe('')
    expect(f.type).toBe('')
    expect(f.addedBy).toBe('')
    expect(f.fileId).toBe('')
    expect(f.folderId).toBe('')
    expect(f.sort).toBe('date')
  })

  it('keeps only UUID category ids', () => {
    const params = new URLSearchParams(`cat=${CAT_A}&cat=nope&cat=${CAT_B}`)
    expect(parseFilters(params).categoryIds).toEqual([CAT_A, CAT_B])
  })

  it('falls back to page 1 for zero, negative or non-numeric pages', () => {
    expect(parseFilters(new URLSearchParams('page=0')).page).toBe(1)
    expect(parseFilters(new URLSearchParams('page=-3')).page).toBe(1)
    expect(parseFilters(new URLSearchParams('page=abc')).page).toBe(1)
  })
})

describe('filtersToSearch', () => {
  it('round-trips through parseFilters', () => {
    const filters = {
      from: '2026-01-01',
      to: '2026-02-28',
      categoryIds: [CAT_A, CAT_B],
      type: 'income',
      addedBy: USER,
      fileId: FILE,
      folderId: '',
      sort: 'category',
      desc: false,
      page: 4,
    }
    expect(parseFilters(filtersToSearch(filters))).toEqual(filters)
  })

  it('leaves out defaults so default filters give an empty query', () => {
    expect(filtersToSearch(defaults).toString()).toBe('')
  })
})

describe('hasActiveFilters', () => {
  it('is false for defaults, including sort and page', () => {
    expect(hasActiveFilters(defaults)).toBe(false)
    expect(hasActiveFilters({ ...defaults, sort: 'amount', desc: false, page: 5 })).toBe(false)
  })

  it.each([
    ['from', { from: '2026-01-01' }],
    ['categoryIds', { categoryIds: [CAT_A] }],
    ['folderId', { folderId: FOLDER }],
  ])('is true when %s is set', (_, change) => {
    expect(hasActiveFilters({ ...defaults, ...change })).toBe(true)
  })
})

describe('entriesRpcArgs', () => {
  it('builds the default arguments', () => {
    expect(entriesRpcArgs('sp1', defaults)).toEqual({
      p_space_id: 'sp1',
      p_file_id: null,
      p_folder_id: null,
      p_from: null,
      p_to: null,
      p_category_ids: null,
      p_type: null,
      p_created_by: null,
      p_sort: 'date',
      p_desc: true,
      p_limit: PAGE_SIZE,
      p_offset: 0,
    })
  })

  it('lets the fileId argument override the File filter and drop the folder filter', () => {
    const args = entriesRpcArgs('sp1', { ...defaults, fileId: FILE, folderId: FOLDER }, CAT_A)
    expect(args.p_file_id).toBe(CAT_A)
    expect(args.p_folder_id).toBeNull()
  })
})

describe('net', () => {
  it('rounds away float noise', () => {
    expect(net(0.1 + 0.2, 0)).toBe(0.3)
    expect(net(0.1, 0.3)).toBe(-0.2)
  })

  it('never returns negative zero', () => {
    expect(Object.is(net(5, 5), 0)).toBe(true)
  })
})

describe('entryErrorMessage', () => {
  it('returns null without an error', () => {
    expect(entryErrorMessage(null)).toBeNull()
  })

  it('explains a future date', () => {
    expect(entryErrorMessage({ code: '23514', message: 'violates check: date in future' })).toBe("The date can't be in the future.")
  })
})

describe('checkEntryWrite', () => {
  it('throws a user-facing error for a database error', async () => {
    await expect(checkEntryWrite(Promise.resolve({ data: null, error: { code: '42501', message: 'rls' } }))).rejects.toThrow(
      "You don't have permission to do that.",
    )
  })

  it('throws when an update or delete matched no rows', async () => {
    await expect(checkEntryWrite(Promise.resolve({ data: [], error: null }))).rejects.toThrow(NO_ROWS_MESSAGE)
  })
})

describe('categoryOptions', () => {
  const categories = [
    { id: 'c1', name: 'Groceries', type: 'expense', color: '#0f0', archived_at: null },
    { id: 'c2', name: 'Old gym', type: 'expense', color: '#f00', archived_at: '2026-01-01T00:00:00Z' },
    { id: 'c3', name: 'Salary', type: 'income', color: '#00f', archived_at: null },
  ]

  it('maps categories to options with group and color', () => {
    expect(categoryOptions(categories)).toEqual([
      { value: 'c1', label: 'Groceries', group: 'expense', color: '#0f0' },
      { value: 'c3', label: 'Salary', group: 'income', color: '#00f' },
    ])
  })

  it('keeps an archived category only when it is the one being edited, and labels it', () => {
    const options = categoryOptions(categories, 'c2')
    expect(options.map((o) => o.value)).toEqual(['c1', 'c2', 'c3'])
    expect(options.find((o) => o.value === 'c2').label).toBe('Old gym (archived)')
  })
})
