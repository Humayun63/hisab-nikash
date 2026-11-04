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
      insert: (...a) => chain(table, 'insert', a),
      update: (...a) => chain(table, 'update', a),
      delete: (...a) => chain(table, 'delete', a),
    })),
  },
}))
vi.mock('../../hooks/useOrgData', () => ({ useSpace: vi.fn() }))
vi.mock('../../hooks/useSpaceData', () => ({
  useSpaceRole: vi.fn(),
  useFolders: vi.fn(),
  useFileTotals: vi.fn(),
}))
import { useSpace } from '../../hooks/useOrgData'
import { useFileTotals, useFolders, useSpaceRole } from '../../hooks/useSpaceData'
import { NO_ROWS_MESSAGE } from '../../lib/structureErrors'
import SpaceLayout from './SpaceLayout'

const space = { id: 'sp1', name: 'Household', currency_code: 'USD', currency_symbol: '$' }
const folders = [
  {
    id: 'fo1',
    name: 'Bills',
    files: [
      { id: 'fi1', name: 'Electric' },
      { id: 'fi2', name: 'Water' },
    ],
  },
  { id: 'fo2', name: 'Empty folder', files: [] },
]
const totals = {
  fi1: { income: 0, expense: 50, net: -50, entryCount: 2 },
  fi2: { income: 200, expense: 0, net: 200, entryCount: 1 },
}

function renderLayout(path = '/spaces/sp1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/spaces/:spaceId" element={<SpaceLayout />}>
            <Route index element={<div>OVERVIEW PAGE</div>} />
            <Route path="files/:fileId" element={<div>FILE PAGE</div>} />
          </Route>
          <Route path="/" element={<div>HOME</div>} />
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
  useSpace.mockReturnValue({ data: space, isPending: false })
  useSpaceRole.mockReturnValue({ role: 'admin', isPending: false })
  useFolders.mockReturnValue({ data: folders, isPending: false })
  useFileTotals.mockReturnValue({ data: totals })
})

describe('SpaceLayout states', () => {
  it('shows a spinner while loading', () => {
    useSpace.mockReturnValue({ data: undefined, isPending: true })
    renderLayout()
    expect(screen.getByRole('status')).toHaveTextContent('Loading space…')
  })
  it('shows an alert on error', () => {
    useSpace.mockReturnValue({ data: undefined, isPending: false, error: new Error('x') })
    renderLayout()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this space')
  })
  it('shows not found when the space is missing', () => {
    useSpace.mockReturnValue({ data: null, isPending: false })
    renderLayout()
    expect(screen.getByText('Space not found')).toBeInTheDocument()
    expect(screen.queryByText('OVERVIEW PAGE')).not.toBeInTheDocument()
  })
})

describe('SpaceLayout sidebar', () => {
  it('renders the space name, currency and role plus the page content', () => {
    renderLayout()
    const nav = screen.getByRole('complementary', { name: 'Household navigation' })
    expect(within(nav).getByText('Household')).toBeInTheDocument()
    expect(within(nav).getByText(/\$ USD · Admin/)).toBeInTheDocument()
    expect(screen.getByText('OVERVIEW PAGE')).toBeInTheDocument()
  })

  it('shows the folder tree with files and net totals', () => {
    renderLayout()
    expect(screen.getByRole('button', { name: 'Bills' })).toHaveAttribute('aria-expanded', 'true')
    const electric = screen.getByRole('link', { name: /Electric/ })
    expect(electric).toHaveAttribute('href', '/spaces/sp1/files/fi1')
    expect(electric).toHaveTextContent('-$50.00')
    expect(screen.getByRole('link', { name: /Water/ })).toHaveTextContent('$200.00')
    expect(screen.getByText('No files')).toBeInTheDocument()
  })

  it('omits the total for files without visible entries', () => {
    useFileTotals.mockReturnValue({ data: {} })
    renderLayout()
    expect(screen.getByRole('link', { name: 'Electric' })).toBeInTheDocument()
  })

  it('collapses and expands a folder', async () => {
    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'Bills' }))
    expect(screen.getByRole('button', { name: 'Bills' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /Electric/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bills' }))
    expect(screen.getByRole('link', { name: /Electric/ })).toBeInTheDocument()
  })

  it('shows a loading state for the tree', () => {
    useFolders.mockReturnValue({ isPending: true })
    renderLayout()
    expect(screen.getByRole('status')).toHaveTextContent('Loading folders…')
  })
  it('shows an error when folders fail to load', () => {
    useFolders.mockReturnValue({ isPending: false, error: new Error('x') })
    renderLayout()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load folders.')
  })
  it('shows an alert when the file totals fail to load', () => {
    useFileTotals.mockReturnValue({ data: undefined, error: new Error('x') })
    renderLayout()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load file totals.')
    expect(screen.getByRole('link', { name: 'Electric' })).toBeInTheDocument()
  })
  it('shows an empty hint tailored to the role', () => {
    useFolders.mockReturnValue({ data: [], isPending: false })
    renderLayout()
    expect(screen.getByText('No folders yet. Create one to start.')).toBeInTheDocument()
  })
  it('shows a plain empty hint for non-admins', () => {
    useSpaceRole.mockReturnValue({ role: 'viewer', isPending: false })
    useFolders.mockReturnValue({ data: [], isPending: false })
    renderLayout()
    expect(screen.getByText('No folders yet.')).toBeInTheDocument()
  })

  it('opens the phone menu toggle', async () => {
    const user = renderLayout()
    const toggle = screen.getByRole('button', { name: 'Space menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide menu' })).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('SpaceLayout role visibility', () => {
  const pagesNav = () => screen.getByRole('navigation', { name: 'Space pages' })

  it.each([
    ['viewer', false, false, false],
    ['editor', false, false, false],
    ['admin', true, false, true],
    ['super_admin', true, true, true],
  ])('%s: categories=%s settings=%s admin actions=%s', (role, categories, settings, actions) => {
    useSpaceRole.mockReturnValue({ role, isPending: false })
    renderLayout()
    expect(within(pagesNav()).getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(!!within(pagesNav()).queryByRole('link', { name: 'Categories' })).toBe(categories)
    expect(!!within(pagesNav()).queryByRole('link', { name: 'Settings' })).toBe(settings)
    expect(!!screen.queryByRole('button', { name: 'New folder' })).toBe(actions)
    expect(!!screen.queryByRole('button', { name: 'Rename folder Bills' })).toBe(actions)
    expect(!!screen.queryByRole('button', { name: 'Delete folder Bills' })).toBe(actions)
    expect(!!screen.queryByRole('button', { name: 'New file in Bills' })).toBe(actions)
  })
})

describe('SpaceLayout folder and file actions', () => {
  it('shows NO_ROWS_MESSAGE when a rename changes no rows', async () => {
    state.result = { error: null, data: [] }
    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'Rename folder Bills' }))
    await user.type(screen.getByLabelText('Folder name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows NO_ROWS_MESSAGE when a folder delete changes no rows', async () => {
    state.result = { error: null, data: [] }
    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'Delete folder Bills' }))
    await user.click(screen.getByRole('button', { name: 'Delete folder' }))
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
  })

  it('creates a folder', async () => {
    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'New folder' }))
    await user.type(screen.getByLabelText('Folder name'), 'Savings')
    await user.click(screen.getByRole('button', { name: 'Create folder' }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ table: 'folders', op: 'insert' })
    expect(calls[0].args[0]).toEqual({ space_id: 'sp1', name: 'Savings' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a friendly message for a duplicate folder name', async () => {
    state.result = { error: { code: '23505', message: 'dup' }, data: null }
    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'New folder' }))
    await user.type(screen.getByLabelText('Folder name'), 'Bills')
    await user.click(screen.getByRole('button', { name: 'Create folder' }))
    expect(await screen.findByText('A folder with this name already exists.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renames a folder, prefilled with its current name', async () => {
    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'Rename folder Bills' }))
    const input = screen.getByLabelText('Folder name')
    expect(input).toHaveValue('Bills')
    await user.clear(input)
    await user.type(input, 'Utilities')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ table: 'folders', op: 'update' })
    expect(calls[0].args[0]).toEqual({ name: 'Utilities' })
    expect(calls[0].then).toEqual([['eq', ['id', 'fo1']], ['select', ['id']]])
  })

  it('creates a file in a folder and opens it', async () => {
    state.result = { error: null, data: { id: 'newfile' } }
    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'New file in Bills' }))
    expect(screen.getByRole('dialog', { name: 'New file in Bills' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('File name'), 'Gas')
    await user.click(screen.getByRole('button', { name: 'Create file' }))
    expect(await screen.findByText('FILE PAGE')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'files', op: 'insert' })
    expect(calls[0].args[0]).toEqual({ space_id: 'sp1', folder_id: 'fo1', name: 'Gas' })
  })

  it('deletes a folder only after confirming', async () => {
    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'Delete folder Bills' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete folder Bills?' })
    expect(calls).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(calls).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Delete folder Bills' }))
    await user.click(screen.getByRole('button', { name: 'Delete folder' }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ table: 'folders', op: 'delete' })
    expect(calls[0].then).toEqual([['eq', ['id', 'fo1']], ['select', ['id']]])
  })

  it('leaves the file page when its folder is deleted', async () => {
    const user = renderLayout('/spaces/sp1/files/fi1')
    expect(screen.getByText('FILE PAGE')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete folder Bills' }))
    await user.click(screen.getByRole('button', { name: 'Delete folder' }))
    expect(await screen.findByText('OVERVIEW PAGE')).toBeInTheDocument()
  })

  it('stays on the page when deleting a different folder', async () => {
    const user = renderLayout('/spaces/sp1/files/fi1')
    await user.click(screen.getByRole('button', { name: 'Delete folder Empty folder' }))
    await user.click(screen.getByRole('button', { name: 'Delete folder' }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(screen.getByText('FILE PAGE')).toBeInTheDocument()
  })
})
