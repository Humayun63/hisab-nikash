import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../hooks/useEntries', () => ({
  useEntries: vi.fn(),
  useOrgProfiles: vi.fn(),
  invalidateEntryData: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../hooks/useSpaceData', () => ({ useCategories: vi.fn(), useFolders: vi.fn() }))
vi.mock('../../hooks/useOrgData', () => ({
  fullName: (p) => `${p.first_name} ${p.last_name}`,
}))
// The edit dialog has its own tests; here it only needs to show which entry was opened.
vi.mock('./EntryForm', () => ({
  EditEntryModal: ({ entry, onClose }) => (
    <div role="dialog" aria-label="Edit stub">
      Editing {entry.id}
      <button type="button" onClick={onClose}>
        Close stub
      </button>
    </div>
  ),
}))

import { useEntries, useOrgProfiles } from '../../hooks/useEntries'
import { useCategories, useFolders } from '../../hooks/useSpaceData'
import { formatDate } from '../../lib/dates'
import EntriesTable from './EntriesTable'

const space = { id: 'sp1', name: 'Home', currency_code: 'USD', currency_symbol: '$' }

const ROWS = [
  {
    id: 'e1',
    entry_date: '2026-11-03',
    category_name: 'Groceries',
    category_color: '#00ff00',
    amount: 250,
    type: 'expense',
    note: 'Weekly shop',
    created_by: 'u1',
    created_by_name: 'Ada Lovelace',
    file_id: 'f1',
    file_name: 'Food',
  },
  {
    id: 'e2',
    entry_date: '2026-11-01',
    category_name: 'Salary',
    category_color: '#0000ff',
    amount: 1000,
    type: 'income',
    note: null,
    created_by: null,
    created_by_name: null,
    file_id: 'f2',
    file_name: 'Pay',
  },
]

const totals = { rows: ROWS, count: 2, income: 1000, expense: 250 }

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderTable({ props = {}, url = '/spaces/sp1/entries' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <EntriesTable space={space} canEdit={false} {...props} />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const location = () => screen.getByTestId('location').textContent

beforeEach(() => {
  vi.clearAllMocks()
  useEntries.mockReturnValue({ data: totals, isPending: false, error: null, isFetching: false, isPlaceholderData: false })
  useOrgProfiles.mockReturnValue({ data: [{ id: 'u1', first_name: 'Ada', last_name: 'Lovelace' }] })
  useCategories.mockReturnValue({ data: [{ id: 'c1', name: 'Groceries', type: 'expense', color: '#0f0' }] })
  useFolders.mockReturnValue({ data: [] })
})

describe('EntriesTable rows', () => {
  it('renders each entry with its category, type, amount and date', () => {
    renderTable()
    const table = screen.getByRole('table', { name: 'Entries' })
    const rows = within(table).getAllByRole('row')
    // One header row plus the two entries.
    expect(rows).toHaveLength(3)
    expect(within(table).getByText('Groceries')).toBeInTheDocument()
    expect(within(table).getByText('$250.00')).toBeInTheDocument()
    expect(within(table).getByText('Expense')).toBeInTheDocument()
    expect(within(table).getByText('Income')).toBeInTheDocument()
    expect(within(table).getByText(formatDate('2026-11-03'))).toBeInTheDocument()
    expect(within(table).getByText('Weekly shop')).toBeInTheDocument()
  })

  it('shows "Deleted user" when the author account is gone', () => {
    renderTable()
    expect(screen.getByText('Deleted user')).toBeInTheDocument()
  })

  it('hides the File column on a file page', () => {
    renderTable({ props: { fileId: 'f1' } })
    expect(screen.queryByRole('columnheader', { name: 'File' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Food' })).not.toBeInTheDocument()
  })
})

describe('EntriesTable actions', () => {
  it('shows no edit or delete buttons without edit permission', () => {
    renderTable({ props: { canEdit: false } })
    expect(screen.queryByRole('button', { name: /^Edit entry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete entry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('shows edit and delete buttons with a description of the entry', () => {
    renderTable({ props: { canEdit: true } })
    expect(screen.getByRole('button', { name: `Edit entry: Groceries, $250.00, ${formatDate('2026-11-03')}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Delete entry: Groceries, $250.00, ${formatDate('2026-11-03')}` })).toBeInTheDocument()
  })

  it('opens the edit dialog for the chosen entry', async () => {
    const user = renderTable({ props: { canEdit: true } })
    await user.click(screen.getByRole('button', { name: /^Edit entry: Salary/ }))
    expect(screen.getByRole('dialog', { name: 'Edit stub' })).toHaveTextContent('Editing e2')
  })

  it('asks for confirmation before deleting', async () => {
    const user = renderTable({ props: { canEdit: true } })
    await user.click(screen.getByRole('button', { name: /^Delete entry: Groceries/ }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this entry?' })
    expect(within(dialog).getByText(/This can't be undone\./)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete entry' })).toBeInTheDocument()
  })
})

describe('EntriesTable sorting and filters', () => {
  it('a new column sorts largest or newest first, then clicking again reverses it in the URL', async () => {
    const user = renderTable()
    await user.click(screen.getByRole('button', { name: 'Amount' }))
    expect(location()).toBe('/spaces/sp1/entries?sort=amount')
    await user.click(screen.getByRole('button', { name: 'Amount' }))
    expect(location()).toBe('/spaces/sp1/entries?sort=amount&dir=asc')
  })

  it('changing a filter returns to the first page', async () => {
    const user = renderTable({ url: '/spaces/sp1/entries?page=3' })
    await user.selectOptions(screen.getByLabelText('Type'), 'income')
    expect(location()).toBe('/spaces/sp1/entries?type=income')
  })
})

describe('EntriesTable totals and pages', () => {
  it('shows income, expense, net and count in the totals bar', () => {
    renderTable()
    const bar = screen.getByLabelText('Totals of the filtered entries')
    expect(within(bar).getByText('$1,000.00')).toBeInTheDocument()
    expect(within(bar).getByText('$250.00')).toBeInTheDocument()
    expect(within(bar).getByText('$750.00')).toBeInTheDocument()
    expect(within(bar).getByText('2')).toBeInTheDocument()
  })

  it('shows a negative net in red', () => {
    useEntries.mockReturnValue({ data: { rows: ROWS, count: 2, income: 100, expense: 250 }, isPending: false, error: null, isFetching: false })
    renderTable()
    const bar = screen.getByLabelText('Totals of the filtered entries')
    const net = within(bar).getByText('Net').nextElementSibling
    expect(net).toHaveClass('text-red-700')
    expect(net.textContent).toContain('150.00')
  })

  it('describes the visible range and the page number', () => {
    useEntries.mockReturnValue({ data: { rows: ROWS, count: 120, income: 0, expense: 0 }, isPending: false, error: null, isFetching: false })
    renderTable({ url: '/spaces/sp1/entries?page=2' })
    expect(screen.getByText('51–52 of 120')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  })
})

describe('EntriesTable states', () => {
  it('shows an alert when loading fails', () => {
    useEntries.mockReturnValue({ data: undefined, isPending: false, error: new Error('x'), isFetching: false })
    renderTable()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load entries.')
  })

  it('says no entries match when filters are active', () => {
    useEntries.mockReturnValue({ data: { rows: [], count: 0, income: 0, expense: 0 }, isPending: false, error: null, isFetching: false })
    renderTable({ url: '/spaces/sp1/entries?type=income' })
    expect(screen.getByText('No entries match these filters.')).toBeInTheDocument()
  })

  it('offers a way back when a later page is empty', async () => {
    useEntries.mockReturnValue({ data: { rows: [], count: 10, income: 0, expense: 0 }, isPending: false, error: null, isFetching: false })
    const user = renderTable({ url: '/spaces/sp1/entries?page=4' })
    expect(screen.getByText('This page is empty.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to the first page' }))
    expect(location()).toBe('/spaces/sp1/entries')
  })
})
