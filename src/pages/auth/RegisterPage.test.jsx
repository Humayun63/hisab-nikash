import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { signUp: vi.fn() } } }))
import { supabase } from '../../lib/supabaseClient'
import RegisterPage from './RegisterPage'

function setup() {
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<div>VERIFY MARKER</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

async function fill(user, v = {}) {
  const d = { first: 'Ada', last: 'Lovelace', email: 'ada@example.com', pw: 'abcdef12', confirm: 'abcdef12', ...v }
  if (d.first) await user.type(screen.getByLabelText('First name'), d.first)
  if (d.last) await user.type(screen.getByLabelText('Last name'), d.last)
  if (d.email) await user.type(screen.getByLabelText('Email'), d.email)
  if (d.pw) await user.type(screen.getByLabelText('Password'), d.pw)
  if (d.confirm) await user.type(screen.getByLabelText('Confirm password'), d.confirm)
}

beforeEach(() => vi.clearAllMocks())

describe('RegisterPage', () => {
  it('shows validation errors and does not call signUp on empty submit', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(screen.getByText('Last name is required')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(supabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('blocks weak password and mismatched confirmation', async () => {
    const user = setup()
    await fill(user, { pw: 'abcdefgh', confirm: 'other' })
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Password must contain a number')).toBeInTheDocument()
    expect(supabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('shows mismatch error when passwords differ', async () => {
    const user = setup()
    await fill(user, { confirm: 'abcdef13' })
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(supabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('signs up and navigates to /verify-email', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null })
    const user = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('VERIFY MARKER')).toBeInTheDocument()
    expect(supabase.auth.signUp).toHaveBeenCalledTimes(1)
    const arg = supabase.auth.signUp.mock.calls[0][0]
    expect(arg.email).toBe('ada@example.com')
    expect(arg.password).toBe('abcdef12')
    expect(arg.options.data).toEqual({ first_name: 'Ada', last_name: 'Lovelace' })
    expect(arg.options.emailRedirectTo).toMatch(/\/auth\/callback$/)
  })

  it('shows the server error via authErrorMessage and stays on the page', async () => {
    supabase.auth.signUp.mockResolvedValue({ data: {}, error: { code: 'weak_password', message: 'raw' } })
    const user = setup()
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters and contain a letter/)
    expect(screen.queryByText('VERIFY MARKER')).not.toBeInTheDocument()
  })
})
