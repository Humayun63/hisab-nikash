import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// Charts need a real layout engine, which jsdom doesn't have; the tables carry the same numbers.
vi.mock('recharts', () => {
  const Stub = () => null
  return {
    Bar: Stub,
    BarChart: Stub,
    CartesianGrid: Stub,
    Cell: Stub,
    Legend: Stub,
    Pie: Stub,
    PieChart: Stub,
    ResponsiveContainer: Stub,
    Tooltip: Stub,
    XAxis: Stub,
    YAxis: Stub,
  }
})
vi.mock('../../auth/AuthProvider', () => ({
  useAuth: vi.fn(() => ({ profile: { id: 'u1', organization: { week_start: 6, timezone: 'Asia/Dhaka' } } })),
}))
vi.mock('../../hooks/useOrgData', () => ({ useSpace: vi.fn() }))
vi.mock('../../hooks/useSpaceData', () => ({ useFolders: vi.fn() }))
vi.mock('../../hooks/useEntries', () => ({ useOrgToday: vi.fn(() => '2026-11-04') }))
vi.mock('../../hooks/useDashboard', () => ({
  useDashboardSummary: vi.fn(),
  useDashboardByCategory: vi.fn(),
  useDashboardTrend: vi.fn(),
  useRecentEntries: vi.fn(),
}))

import { useSpace } from '../../hooks/useOrgData'
import { useFolders } from '../../hooks/useSpaceData'
import { useDashboardByCategory, useDashboardSummary, useDashboardTrend, useRecentEntries } from '../../hooks/useDashboard'
import DashboardPage from './DashboardPage'

const space = { id: 'sp1', name: 'Home', currency_code: 'USD', currency_symbol: '$' }
const FOLDER = 'a0000000-0000-4000-8000-000000000001'

const SUMMARY = {
  income: 1000,
  expense: 400,
  net: 600,
  count: 5,
  prevIncome: 800,
  prevExpense: 500,
  prevNet: 300,
}

const BY_CATEGORY = [
  { category_id: 'c1', name: 'Groceries', color: '#00ff00', type: 'expense', total: 300, entry_count: 3 },
  { category_id: 'c2', name: 'Rent', color: '#ff0000', type: 'expense', total: 100, entry_count: 1 },
  { category_id: 'c3', name: 'Salary', color: '#0000ff', type: 'income', total: 1000, entry_count: 2 },
]

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderDashboard(url = '/spaces/sp1/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/spaces/:spaceId/dashboard"
            element={
              <>
                <DashboardPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/spaces/:spaceId/entries" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const ok = (data) => ({ data, error: null, isPending: false })

beforeEach(() => {
  vi.clearAllMocks()
  useSpace.mockReturnValue({ data: space })
  useFolders.mockReturnValue({ data: [] })
  useDashboardSummary.mockReturnValue(ok(SUMMARY))
  useDashboardByCategory.mockReturnValue(ok(BY_CATEGORY))
  useDashboardTrend.mockReturnValue(ok([]))
  useRecentEntries.mockReturnValue(ok([]))
})

describe('DashboardPage summary', () => {
  it('shows expense, income and net with their change from the previous period', () => {
    renderDashboard()
    const dl = screen.getByLabelText('Summary')
    expect(within(dl).getByText('$400.00')).toBeInTheDocument()
    expect(within(dl).getByText('$1,000.00')).toBeInTheDocument()
    expect(within(dl).getByText('$600.00')).toBeInTheDocument()
    // Expense went down by 20%, which is good; income up 25%; net up 100%.
    expect(within(dl).getByText(/Down 20% on the previous period/)).toHaveClass('text-emerald-700')
    expect(within(dl).getByText(/Up 25% on the previous period/)).toHaveClass('text-emerald-700')
    expect(within(dl).getByText(/Up 100% on the previous period/)).toBeInTheDocument()
  })

  it('shows a negative net in red', () => {
    useDashboardSummary.mockReturnValue(ok({ ...SUMMARY, income: 100, net: -300, prevNet: -300 }))
    renderDashboard()
    const dl = screen.getByLabelText('Summary')
    expect(within(dl).getByText('-$300.00')).toHaveClass('text-red-700')
  })
})

describe('DashboardPage periods', () => {
  it('marks Today as pressed by default', () => {
    renderDashboard()
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switching period updates the URL and the pressed button', async () => {
    const user = renderDashboard()
    await user.click(screen.getByRole('button', { name: 'This month' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/spaces/sp1/dashboard?period=month')
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a custom range from the URL is used for the queries', () => {
    renderDashboard('/spaces/sp1/dashboard?period=custom&from=2026-01-01&to=2026-01-31')
    expect(useDashboardSummary).toHaveBeenLastCalledWith('sp1', expect.objectContaining({ from: '2026-01-01', to: '2026-01-31' }))
    expect(screen.getByText(/1 Jan 2026|Jan 1, 2026/)).toBeInTheDocument()
  })
})

describe('DashboardPage category tables', () => {
  it('lists expense categories with their share of the total', () => {
    renderDashboard()
    const section = screen.getByRole('region', { name: 'Expense by category' })
    const rows = within(section).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('75%')).toBeInTheDocument()
    expect(within(rows[1]).getByText('25%')).toBeInTheDocument()
    expect(within(rows[0]).getByText('$300.00')).toBeInTheDocument()
  })

  it('category names link to the entries list filtered to that category and period', () => {
    renderDashboard()
    const link = screen.getByRole('link', { name: 'Groceries' })
    expect(link).toHaveAttribute('href', '/spaces/sp1/entries?from=2026-11-04&to=2026-11-04&cat=c1')
  })

  it('carries the folder scope into the category links', () => {
    renderDashboard(`/spaces/sp1/dashboard?scope=folder:${FOLDER}`)
    expect(screen.getByRole('link', { name: 'Groceries' })).toHaveAttribute(
      'href',
      `/spaces/sp1/entries?from=2026-11-04&to=2026-11-04&cat=c1&folder=${FOLDER}`,
    )
  })

  it('says when there is no expense in the period', () => {
    useDashboardByCategory.mockReturnValue(ok(BY_CATEGORY.filter((r) => r.type === 'income')))
    renderDashboard()
    expect(screen.getByText('No expense in this period.')).toBeInTheDocument()
  })
})

describe('DashboardPage scope, trend and recent entries', () => {
  it('shows recent entries with their signed amounts and links to the file', () => {
    useRecentEntries.mockReturnValue(
      ok([
        {
          id: 'e1',
          type: 'expense',
          amount: 12,
          category_name: 'Groceries',
          category_color: '#0f0',
          entry_date: '2026-11-03',
          file_id: 'f1',
          file_name: 'Food',
          note: 'Milk',
        },
        {
          id: 'e2',
          type: 'income',
          amount: 500,
          category_name: 'Salary',
          category_color: '#00f',
          entry_date: '2026-11-01',
          file_id: 'f2',
          file_name: 'Pay',
          note: null,
        },
      ]),
    )
    renderDashboard()
    const list = screen.getByRole('list')
    expect(within(list).getByRole('link', { name: /Groceries/ })).toHaveAttribute('href', '/spaces/sp1/files/f1')
    expect(within(list).getByText(/Milk/)).toBeInTheDocument()
    expect(within(list).getByText(/−\$12\.00/)).toBeInTheDocument()
    expect(within(list).getByText(/\+\$500\.00/)).toBeInTheDocument()
  })

  it('says there are no recent entries yet', () => {
    renderDashboard()
    expect(screen.getByText('No entries yet.')).toBeInTheDocument()
  })

  it('shows an alert when part of the dashboard fails, and keeps the rest', () => {
    useDashboardByCategory.mockReturnValue({ data: undefined, error: new Error('x'), isPending: false })
    renderDashboard()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load some of the dashboard.')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})
