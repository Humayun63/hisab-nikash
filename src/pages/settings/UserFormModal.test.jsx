import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const calls = []
// Records supabase.from('space_members').<op>(...)... chains; every chain resolves to { error: null }.
function chain(op, args) {
  const entry = { op, args, then: [] }
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
    from: vi.fn(() => ({
      insert: (...a) => chain('insert', a),
      update: (...a) => chain('update', a),
      delete: (...a) => chain('delete', a),
    })),
  },
}))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/adminUsers', async (orig) => ({ ...(await orig()), invokeAdminUsers: vi.fn() }))
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../auth/AuthProvider'
import { invokeAdminUsers } from '../../lib/adminUsers'
import UserFormModal from './UserFormModal'

const S1 = 's1'
const S2 = 's2'
const S3 = 's3'
const spaces = [
  { id: S1, name: 'Household' },
  { id: S2, name: 'Business' },
  { id: S3, name: 'Charity' },
]
const refreshProfile = vi.fn()
let onSaved, onClose

function renderModal(props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <UserFormModal spaces={spaces} onSaved={onSaved} onClose={onClose} {...props} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  onSaved = vi.fn()
  onClose = vi.fn()
  useAuth.mockReturnValue({ profile: { id: 'me' }, refreshProfile })
  invokeAdminUsers.mockResolvedValue({ invitation: { sent: true } })
})

async function fillCreate(user, overrides = {}) {
  await user.type(screen.getByLabelText('First name'), overrides.first ?? 'Ann')
  await user.type(screen.getByLabelText('Last name'), 'Lee')
  await user.type(screen.getByLabelText('Email'), 'ann@x.co')
  await user.type(screen.getByLabelText('Password'), 'secret123')
}

describe('UserFormModal create', () => {
  it('shows validation errors and does not submit', async () => {
    const user = renderModal({ mode: 'create' })
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(screen.getByText('Last name is required')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(invokeAdminUsers).not.toHaveBeenCalled()
  })
  it('Generate password fills a valid password and reveals it', async () => {
    const user = renderModal({ mode: 'create' })
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Generate password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(input.value).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{14}$/)
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
  })
  it('submits create with memberships only for spaces with a role, and reports success', async () => {
    const user = renderModal({ mode: 'create' })
    await fillCreate(user)
    await user.selectOptions(screen.getByLabelText('Household'), 'editor')
    await user.selectOptions(screen.getByLabelText('Charity'), 'viewer')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(invokeAdminUsers).toHaveBeenCalledWith('create', {
      first_name: 'Ann',
      last_name: 'Lee',
      email: 'ann@x.co',
      password: 'secret123',
      must_change_password: true,
      memberships: [
        { space_id: S1, role: 'editor' },
        { space_id: S3, role: 'viewer' },
      ],
    })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success', text: expect.stringContaining('invitation was sent to ann@x.co') }))
    expect(supabase.from).not.toHaveBeenCalled()
  })
  it('sends must_change_password false when unticked', async () => {
    const user = renderModal({ mode: 'create' })
    await fillCreate(user)
    await user.click(screen.getByLabelText('Require a new password at first sign-in'))
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await vi.waitFor(() => expect(invokeAdminUsers).toHaveBeenCalled())
    expect(invokeAdminUsers.mock.calls[0][1]).toMatchObject({ must_change_password: false, memberships: [] })
  })
  it('gives an info notice when the invitation was not sent', async () => {
    invokeAdminUsers.mockResolvedValue({ invitation: { sent: false, error: 'rate limit' } })
    const user = renderModal({ mode: 'create' })
    await fillCreate(user)
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSaved.mock.calls[0][0].tone).toBe('info')
    expect(onSaved.mock.calls[0][0].text).toContain('rate limit')
    expect(onClose).toHaveBeenCalled()
  })
  it('shows the server error and stays open', async () => {
    invokeAdminUsers.mockRejectedValue(new Error('A user with this email already exists'))
    const user = renderModal({ mode: 'create' })
    await fillCreate(user)
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A user with this email already exists')
    expect(onClose).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('UserFormModal edit', () => {
  const target = {
    id: 'u1',
    first_name: 'Ann',
    last_name: 'Lee',
    email: 'ann@x.co',
    status: 'active',
    space_members: [
      { space_id: S1, role: 'viewer' },
      { space_id: S2, role: 'admin' },
    ],
  }

  it('prefills values and hides the must-change checkbox until a password is typed', async () => {
    const user = renderModal({ mode: 'edit', user: target })
    expect(screen.getByLabelText('First name')).toHaveValue('Ann')
    expect(screen.getByLabelText('Email')).toHaveValue('ann@x.co')
    expect(screen.getByLabelText('Account enabled')).toBeChecked()
    expect(screen.getByLabelText('Household')).toHaveValue('viewer')
    expect(screen.getByLabelText('Charity')).toHaveValue('')
    expect(screen.queryByLabelText('Require a new password at first sign-in')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('New password'), 'x')
    expect(screen.getByLabelText('Require a new password at first sign-in')).toBeInTheDocument()
  })
  it('with no changes calls no update and no membership writes', async () => {
    const user = renderModal({ mode: 'edit', user: target })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
  it('sends only the changed fields', async () => {
    const user = renderModal({ mode: 'edit', user: target })
    const first = screen.getByLabelText('First name')
    await user.clear(first)
    await user.type(first, 'Annie')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers).toHaveBeenCalledWith('update', { user_id: 'u1', first_name: 'Annie' })
  })
  it('does not treat an email case change as a change', async () => {
    const user = renderModal({ mode: 'edit', user: target })
    const email = screen.getByLabelText('Email')
    await user.clear(email)
    await user.type(email, 'ANN@x.co')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers).not.toHaveBeenCalled()
  })
  it('sends password and must_change_password only when a new password is typed', async () => {
    const user = renderModal({ mode: 'edit', user: target })
    await user.type(screen.getByLabelText('New password'), 'newpass99')
    await user.click(screen.getByLabelText('Require a new password at first sign-in'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers).toHaveBeenCalledWith('update', { user_id: 'u1', password: 'newpass99', must_change_password: false })
  })
  it('rejects a weak new password', async () => {
    const user = renderModal({ mode: 'edit', user: target })
    await user.type(screen.getByLabelText('New password'), 'weak')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(invokeAdminUsers).not.toHaveBeenCalled()
  })
  it('sends status disabled when Enabled is unticked, and active when re-ticked on a disabled user', async () => {
    let user = renderModal({ mode: 'edit', user: target })
    await user.click(screen.getByLabelText('Account enabled'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers).toHaveBeenLastCalledWith('update', { user_id: 'u1', status: 'disabled' })

    document.body.innerHTML = ''
    onSaved.mockClear()
    user = renderModal({ mode: 'edit', user: { ...target, status: 'disabled' } })
    expect(screen.getByLabelText('Account enabled')).not.toBeChecked()
    await user.click(screen.getByLabelText('Account enabled'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers).toHaveBeenLastCalledWith('update', { user_id: 'u1', status: 'active' })
  })
  it('sends the full new space access list in the same update request', async () => {
    const user = renderModal({ mode: 'edit', user: target })
    await user.selectOptions(screen.getByLabelText('Household'), 'editor') // update
    await user.selectOptions(screen.getByLabelText('Business'), '') // remove
    await user.selectOptions(screen.getByLabelText('Charity'), 'admin') // add
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())

    expect(supabase.from).not.toHaveBeenCalled()
    expect(invokeAdminUsers).toHaveBeenCalledTimes(1)
    const [action, payload] = invokeAdminUsers.mock.calls[0]
    expect(action).toBe('update')
    expect(payload.user_id).toBe('u1')
    expect(payload.memberships).toEqual(
      expect.arrayContaining([
        { space_id: S1, role: 'editor' },
        { space_id: S3, role: 'admin' },
      ]),
    )
    expect(payload.memberships).toHaveLength(2)
  })

  it('does not send memberships when space access is unchanged', async () => {
    const user = renderModal({ mode: 'edit', user: target })
    await user.type(screen.getByLabelText('Last name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers.mock.calls[0][1].memberships).toBeUndefined()
  })

  it('a super admin setting their own password is not forced to change it', async () => {
    const user = renderModal({ mode: 'edit', user: { ...target, id: 'me' } })
    await user.type(screen.getByLabelText('New password'), 'mynewpass1')
    expect(screen.queryByLabelText('Require a new password at first sign-in')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers).toHaveBeenCalledWith('update', { user_id: 'me', password: 'mynewpass1' })
  })
  it('self-edit hides Enabled and Space access, and never touches memberships or status', async () => {
    const user = renderModal({ mode: 'edit', user: { ...target, id: 'me' } })
    expect(screen.queryByLabelText('Account enabled')).not.toBeInTheDocument()
    expect(screen.queryByText('Space access')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Household')).not.toBeInTheDocument()
    const first = screen.getByLabelText('First name')
    await user.clear(first)
    await user.type(first, 'Sam')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(invokeAdminUsers).toHaveBeenCalledWith('update', { user_id: 'me', first_name: 'Sam' })
    expect(supabase.from).not.toHaveBeenCalled()
    expect(refreshProfile).toHaveBeenCalled()
  })
  it('shows the server error from update', async () => {
    invokeAdminUsers.mockRejectedValue(new Error('boom'))
    const user = renderModal({ mode: 'edit', user: target })
    await user.type(screen.getByLabelText('Last name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(onClose).not.toHaveBeenCalled()
  })
})
