import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/adminUsers', async (orig) => ({ ...(await orig()), invokeAdminUsers: vi.fn() }))
vi.mock('../../hooks/useOrgData', async (orig) => ({ ...(await orig()), useOrgUsers: vi.fn(), useSpaces: vi.fn() }))
import { useAuth } from '../../auth/AuthProvider'
import { invokeAdminUsers } from '../../lib/adminUsers'
import { useOrgUsers, useSpaces } from '../../hooks/useOrgData'
import UsersPage from './UsersPage'

const users = [
  { id: 'me', first_name: 'Sam', last_name: 'Boss', email: 'sam@x.co', status: 'active', is_super_admin: true, space_members: [], created_at: '2026-01-01T00:00:00Z' },
  { id: 'u1', first_name: 'Ann', last_name: 'Lee', email: 'ann@x.co', status: 'invited', is_super_admin: false, space_members: [{ space_id: 's1', role: 'editor' }], created_at: '2026-01-02T00:00:00Z' },
  { id: 'u2', first_name: 'Bob', last_name: 'Ray', email: 'bob@x.co', status: 'active', is_super_admin: false, space_members: [], created_at: '2026-01-03T00:00:00Z' },
  { id: 'u3', first_name: 'Cy', last_name: 'Dee', email: 'cy@x.co', status: 'disabled', is_super_admin: false, space_members: [], created_at: '2026-01-04T00:00:00Z' },
]
const spaces = [{ id: 's1', name: 'Household', space_members: [] }]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ profile: { id: 'me', is_super_admin: true }, refreshProfile: vi.fn() })
  useOrgUsers.mockReturnValue({ data: users, isPending: false, error: null })
  useSpaces.mockReturnValue({ data: spaces, isPending: false, error: null })
})

const row = (name) => screen.getByRole('row', { name: new RegExp(name) })

describe('UsersPage', () => {
  it('renders a row per user with status badges and space access', () => {
    renderPage()
    expect(within(row('Sam Boss')).getByText('Super admin')).toBeInTheDocument()
    expect(within(row('Sam Boss')).getByText('All spaces')).toBeInTheDocument()
    expect(within(row('Ann Lee')).getByText('Invited')).toBeInTheDocument()
    expect(within(row('Ann Lee')).getByText('Household · Editor')).toBeInTheDocument()
    expect(within(row('Bob Ray')).getByText('Active')).toBeInTheDocument()
    expect(within(row('Bob Ray')).getByText('No spaces')).toBeInTheDocument()
    expect(within(row('Cy Dee')).getByText('Disabled')).toBeInTheDocument()
  })
  it('marks only the current user with "(you)" and gives them no Delete', () => {
    renderPage()
    expect(within(row('Sam Boss')).getByText('(you)')).toBeInTheDocument()
    expect(within(row('Ann Lee')).queryByText('(you)')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Sam Boss' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Ann Lee' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Sam Boss' })).toBeInTheDocument()
  })
  it('shows Resend invite only for invited users', () => {
    renderPage()
    expect(screen.getAllByRole('button', { name: /Resend invitation/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Resend invitation to Ann Lee' })).toBeInTheDocument()
  })
  it('resend success shows a success notice', async () => {
    invokeAdminUsers.mockResolvedValue({ invitation: { sent: true } })
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Resend invitation to Ann Lee' }))
    expect(invokeAdminUsers).toHaveBeenCalledWith('resend_invitation', { user_id: 'u1' })
    expect(await screen.findByText('Invitation sent again to ann@x.co.')).toBeInTheDocument()
  })
  it('resend with invitation.sent false shows the failure reason', async () => {
    invokeAdminUsers.mockResolvedValue({ invitation: { sent: false, error: 'SMTP down' } })
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Resend invitation to Ann Lee' }))
    expect(await screen.findByText('Could not send the invitation to ann@x.co: SMTP down')).toBeInTheDocument()
  })
  it('resend request failure shows the error message', async () => {
    invokeAdminUsers.mockRejectedValue(new Error('Network exploded'))
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Resend invitation to Ann Lee' }))
    expect(await screen.findByText('Network exploded')).toBeInTheDocument()
  })
  it('delete asks for confirmation then calls the delete action', async () => {
    invokeAdminUsers.mockResolvedValue({})
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete Bob Ray' }))
    expect(screen.getByRole('dialog', { name: 'Delete Bob Ray?' })).toBeInTheDocument()
    expect(invokeAdminUsers).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete user' }))
    expect(invokeAdminUsers).toHaveBeenCalledWith('delete', { user_id: 'u2' })
    expect(await screen.findByText('Bob Ray was deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('cancelling the delete does not call the function', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete Bob Ray' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(invokeAdminUsers).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('shows a failed delete inside the dialog', async () => {
    invokeAdminUsers.mockRejectedValue(new Error('User not found'))
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete Bob Ray' }))
    await user.click(screen.getByRole('button', { name: 'Delete user' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('User not found')
  })
  it('opens the add-user form', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    expect(screen.getByRole('dialog', { name: 'Add user' })).toBeInTheDocument()
  })
  it('shows an error when users fail to load', () => {
    useOrgUsers.mockReturnValue({ data: undefined, isPending: false, error: new Error('x') })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load users.')
  })
})
