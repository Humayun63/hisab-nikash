import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { auth: { updateUser: vi.fn() }, rpc: vi.fn() },
}))
import { supabase } from '../../lib/supabaseClient'
import NewPasswordForm from './NewPasswordForm'

beforeEach(() => vi.clearAllMocks())

async function fill(user, pw = 'abcdef12', confirm = 'abcdef12') {
  await user.type(screen.getByLabelText('New password'), pw)
  await user.type(screen.getByLabelText('Confirm new password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Save new password' }))
}

describe('NewPasswordForm', () => {
  it('blocks submit on mismatch', async () => {
    const user = userEvent.setup()
    render(<NewPasswordForm onDone={vi.fn()} />)
    await fill(user, 'abcdef12', 'abcdef13')
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('updates the password, then calls onDone (the server clears must_change_password)', async () => {
    const order = []
    supabase.auth.updateUser.mockImplementation(async () => (order.push('update'), { error: null }))
    const onDone = vi.fn(async () => order.push('done'))
    const user = userEvent.setup()
    render(<NewPasswordForm onDone={onDone} />)
    await fill(user)
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'abcdef12' })
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(order).toEqual(['update', 'done'])
  })

  it('shows updateUser error and skips rpc and onDone', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: { code: 'same_password', message: 'x' } })
    const onDone = vi.fn()
    const user = userEvent.setup()
    render(<NewPasswordForm onDone={onDone} />)
    await fill(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/must be different/)
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('uses a custom submit label', () => {
    render(<NewPasswordForm submitLabel="Change it" />)
    expect(screen.getByRole('button', { name: 'Change it' })).toBeInTheDocument()
  })
})
