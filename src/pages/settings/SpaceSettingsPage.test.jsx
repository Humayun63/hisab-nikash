import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const calls = []
function chain(table, op, args) {
  const entry = { table, op, args, then: [] }
  calls.push(entry)
  const proxy = new Proxy(() => {}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve({ error: null })
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
vi.mock('../../hooks/useOrgData', async (orig) => ({
  ...(await orig()),
  useSpace: vi.fn(),
  useSpaceMembers: vi.fn(),
  useOrgUsers: vi.fn(),
}))
import { useOrgUsers, useSpace, useSpaceMembers } from '../../hooks/useOrgData'
import SpaceSettingsPage from './SpaceSettingsPage'

const space = { id: 'sp1', name: 'Household', description: '', currency_code: 'BDT', currency_symbol: '৳' }
const p = (id, first, extra = {}) => ({ id, first_name: first, last_name: 'X', email: `${first.toLowerCase()}@x.co`, status: 'active', is_super_admin: false, ...extra })
const orgUsers = [p('boss', 'Boss', { is_super_admin: true }), p('u1', 'Ann'), p('u2', 'Bob'), p('u3', 'Cy')]
const members = [{ user_id: 'u1', role: 'viewer', profile: p('u1', 'Ann') }]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/spaces/sp1/settings']}>
        <Routes>
          <Route path="/spaces/:spaceId/settings" element={<SpaceSettingsPage />} />
          <Route path="/settings/spaces" element={<div>SPACES LIST</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  useSpace.mockReturnValue({ data: space, isPending: false })
  useSpaceMembers.mockReturnValue({ data: members, isPending: false })
  useOrgUsers.mockReturnValue({ data: orgUsers, isPending: false })
})

describe('SpaceSettingsPage', () => {
  it('shows not found when the space is missing', () => {
    useSpace.mockReturnValue({ data: null, isPending: false })
    renderPage()
    expect(screen.getByText('Space not found')).toBeInTheDocument()
  })

  it('lists members with roles', () => {
    renderPage()
    const members = screen.getByRole('region', { name: 'Members' })
    const item = within(members).getByRole('listitem', { name: 'Ann X' })
    expect(within(item).getByLabelText('Role for Ann X')).toHaveValue('viewer')
  })

  it('offers only non-super-admin non-members when adding a member', () => {
    renderPage()
    const select = screen.getByLabelText('Add a member')
    const labels = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(labels).toEqual(['Choose a user…', 'Bob X (bob@x.co)', 'Cy X (cy@x.co)'])
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  it('adds a member with the chosen role', async () => {
    const user = renderPage()
    await user.selectOptions(screen.getByLabelText('Add a member'), 'u2')
    await user.selectOptions(screen.getByLabelText('Role'), 'editor')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Bob X added as Editor.')).toBeInTheDocument()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'space_members', op: 'insert' })
    expect(calls[0].args[0]).toEqual({ space_id: 'sp1', user_id: 'u2', role: 'editor' })
  })

  it('changes a member role', async () => {
    const user = renderPage()
    await user.selectOptions(screen.getByLabelText('Role for Ann X'), 'admin')
    expect(await screen.findByText('Ann X is now Admin.')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'space_members', op: 'update' })
    expect(calls[0].args[0]).toEqual({ role: 'admin' })
    expect(calls[0].then).toEqual([['eq', ['space_id', 'sp1']], ['eq', ['user_id', 'u1']]])
  })

  it('removes a member only after confirming', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Remove Ann X' }))
    expect(calls).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'Remove Ann X from Household?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove member' }))
    expect(await screen.findByText('Ann X was removed from Household.')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'space_members', op: 'delete' })
    expect(calls[0].then).toEqual([['eq', ['space_id', 'sp1']], ['eq', ['user_id', 'u1']]])
  })

  it('delete space requires typing the name, then deletes and navigates away', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete this space' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Household?' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete space' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Type "Household" to confirm'), 'Househol')
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByLabelText(/Type "Household"/), 'd')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(await screen.findByText('SPACES LIST')).toBeInTheDocument()
    expect(calls.at(-1)).toMatchObject({ table: 'spaces', op: 'delete' })
    expect(calls.at(-1).then).toEqual([['eq', ['id', 'sp1']]])
  })

  it('saves general details to the spaces table', async () => {
    const user = renderPage()
    const name = screen.getByLabelText('Space name')
    await user.clear(name)
    await user.type(name, 'Home')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Space details saved.')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'spaces', op: 'update' })
    expect(calls[0].args[0]).toMatchObject({ name: 'Home', currency_code: 'BDT', currency_symbol: '৳' })
    expect(calls[0].then).toEqual([['eq', ['id', 'sp1']]])
  })
})
