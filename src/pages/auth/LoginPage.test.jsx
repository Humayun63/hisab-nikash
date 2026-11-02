import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { resend: vi.fn() } } }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
import { useAuth } from '../../auth/AuthProvider'
import LoginPage from './LoginPage'

const signIn = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ signIn })
})

function setup(state) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <LoginPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

async function submit(user) {
  await user.type(screen.getByLabelText('Email'), 'a@b.co')
  await user.type(screen.getByLabelText('Password'), 'secret')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
  it('validates before calling signIn', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('calls signIn with email and password', async () => {
    signIn.mockResolvedValue({ error: null })
    const user = setup()
    await submit(user)
    expect(signIn).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).not.toBeInTheDocument()
  })

  it('on invalid_credentials shows message and the resend control', async () => {
    signIn.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'x' } })
    const user = setup()
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Incorrect email or password/)
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeInTheDocument()
  })

  it('on email_not_confirmed shows the resend control', async () => {
    signIn.mockResolvedValue({ error: { code: 'email_not_confirmed', message: 'x' } })
    const user = setup()
    await submit(user)
    expect(await screen.findByRole('button', { name: 'Resend verification email' })).toBeInTheDocument()
  })

  it('other errors show no resend control', async () => {
    signIn.mockResolvedValue({ error: { code: 'over_request_rate_limit', message: 'x' } })
    const user = setup()
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many attempts/)
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).not.toBeInTheDocument()
  })

  it('shows location.state.message as info', () => {
    setup({ message: 'Password updated. Please sign in.' })
    expect(screen.getByRole('status')).toHaveTextContent('Password updated. Please sign in.')
  })
})
