import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const calls = []
const OK = { error: null, data: [{ id: 'x' }] }
const state = { result: OK }
function chain(table, op, args) {
  const entry = { table, op, args, then: [] }
  calls.push(entry)
  const proxy = new Proxy(() => {}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(state.result)
      return (...a) => {
        entry.then.push([prop, a])
        return proxy
      }
    },
  })
  return proxy
}
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table) => ({
      update: (...a) => chain(table, 'update', a),
      delete: (...a) => chain(table, 'delete', a),
    })),
  },
}))
vi.mock('../../hooks/useOrgData', () => ({ useSpace: vi.fn() }))
vi.mock('../../hooks/useSpaceData', () => ({ useSpaceRole: vi.fn(), useFolders: vi.fn(), useFileTotals: vi.fn() }))
import { useSpace } from '../../hooks/useOrgData'
import { useFileTotals, useFolders, useSpaceRole } from '../../hooks/useSpaceData'
import { NO_ROWS_MESSAGE } from '../../lib/structureErrors'
import FilePage from './FilePage'

const space = { id: 'sp1', name: 'Household', currency_code: 'USD', currency_symbol: '$' }
const folders = [{ id: 'fo1', name: 'Bills', files: [{ id: 'fi1', name: 'Electric' }] }]

function renderPage(fileId = 'fi1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/spaces/sp1/files/${fileId}`]}>
        <Routes>
          <Route path="/spaces/:spaceId/files/:fileId" element={<FilePage />} />
          <Route path="/spaces/:spaceId" element={<div>OVERVIEW</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  state.result = OK
  useSpace.mockReturnValue({ data: space })
  useSpaceRole.mockReturnValue({ role: 'admin', isPending: false })
  useFolders.mockReturnValue({ data: folders, isPending: false })
  useFileTotals.mockReturnValue({ data: { fi1: { income: 300, expense: 120.5, net: 179.5, entryCount: 4 } } })
})

describe('FilePage', () => {
  it('shows a spinner while loading', () => {
    useFolders.mockReturnValue({ isPending: true })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading file…')
  })
  it('shows an error when folders fail', () => {
    useFolders.mockReturnValue({ isPending: false, error: new Error('x') })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this file.')
  })
  it('shows not found for an unknown file with a way back', () => {
    renderPage('missing')
    expect(screen.getByText('File not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Household' })).toHaveAttribute('href', '/spaces/sp1')
  })

  it('shows breadcrumb, title and totals', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Electric' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Bills / Electric')
    const totals = screen.getByLabelText('File totals')
    expect(totals).toHaveTextContent('Income$300.00')
    expect(totals).toHaveTextContent('Expense$120.50')
    expect(totals).toHaveTextContent('Net$179.50')
    expect(screen.getByText(/4 entries\./)).toBeInTheDocument()
  })
  it('defaults to zero totals and singular entry wording', () => {
    useFileTotals.mockReturnValue({ data: {} })
    renderPage()
    expect(screen.getByLabelText('File totals')).toHaveTextContent('Net$0.00')
    expect(screen.getByText(/0 entries\./)).toBeInTheDocument()
  })
  it('uses singular "entry" for one', () => {
    useFileTotals.mockReturnValue({ data: { fi1: { income: 1, expense: 0, net: 1, entryCount: 1 } } })
    renderPage()
    expect(screen.getByText(/1 entry\./)).toBeInTheDocument()
  })
  it('shows placeholders while totals load', () => {
    useFileTotals.mockReturnValue({ data: undefined })
    renderPage()
    expect(screen.getByLabelText('File totals')).toHaveTextContent('Income…')
    expect(screen.getByLabelText('File totals')).toHaveTextContent('Net…')
    expect(screen.getByLabelText('File totals')).not.toHaveTextContent('$0.00')
    expect(screen.queryByText(/entries\./)).not.toBeInTheDocument()
  })
  it('shows an alert when totals fail to load, not zeros', () => {
    useFileTotals.mockReturnValue({ data: undefined, error: new Error('x') })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the totals.')
    expect(screen.getByLabelText('File totals')).not.toHaveTextContent('$0.00')
  })
  it('shows NO_ROWS_MESSAGE when the rename changes no rows', async () => {
    state.result = { error: null, data: [] }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Rename file' }))
    await user.type(screen.getByLabelText('File name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
  })
  it('shows NO_ROWS_MESSAGE and stays when the delete changes no rows', async () => {
    state.result = { error: null, data: [] }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete file' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete file' }))
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('OVERVIEW')).not.toBeInTheDocument()
  })
  it('renders a negative net', () => {
    useFileTotals.mockReturnValue({ data: { fi1: { income: 0, expense: 10, net: -10, entryCount: 1 } } })
    renderPage()
    expect(screen.getByLabelText('File totals')).toHaveTextContent('Net-$10.00')
  })

  it.each(['viewer', 'editor'])('hides rename and delete for %s', (role) => {
    useSpaceRole.mockReturnValue({ role, isPending: false })
    renderPage()
    expect(screen.queryByRole('button', { name: 'Rename file' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete file' })).not.toBeInTheDocument()
  })
  it.each(['admin', 'super_admin'])('shows rename and delete for %s', (role) => {
    useSpaceRole.mockReturnValue({ role, isPending: false })
    renderPage()
    expect(screen.getByRole('button', { name: 'Rename file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete file' })).toBeInTheDocument()
  })

  it('renames the file', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Rename file' }))
    const input = screen.getByLabelText('File name')
    expect(input).toHaveValue('Electric')
    await user.clear(input)
    await user.type(input, 'Power')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ table: 'files', op: 'update' })
    expect(calls[0].args[0]).toEqual({ name: 'Power' })
    expect(calls[0].then).toEqual([['eq', ['id', 'fi1']], ['select', ['id']]])
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('shows a duplicate-name error when renaming fails', async () => {
    state.result = { error: { code: '23505' }, data: null }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Rename file' }))
    await user.type(screen.getByLabelText('File name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('A file with this name already exists.')).toBeInTheDocument()
  })

  it('deletes the file after confirming and returns to the overview', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete file' }))
    expect(screen.getByRole('dialog', { name: 'Delete Electric?' })).toBeInTheDocument()
    expect(calls).toHaveLength(0)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete file' }))
    expect(await screen.findByText('OVERVIEW')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'files', op: 'delete' })
    expect(calls[0].then).toEqual([['eq', ['id', 'fi1']], ['select', ['id']]])
  })
})
