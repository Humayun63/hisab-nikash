import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { resend: vi.fn() } } }))
import { supabase } from '../../lib/supabaseClient'
import ResendVerification from './ResendVerification'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => vi.useRealTimers())

// userEvent's async wrapper hangs under vitest fake timers, so click with fireEvent inside act.
const click = async (name) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('ResendVerification', () => {
  it('resends a signup email and starts a decrementing cooldown', async () => {
    supabase.auth.resend.mockResolvedValue({ error: null })
    render(<ResendVerification email="a@b.co" />)
    await click('Resend verification email')

    expect(supabase.auth.resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'signup', email: 'a@b.co' }),
    )
    expect(supabase.auth.resend.mock.calls[0][0].options.emailRedirectTo).toMatch(/\/auth\/callback$/)
    expect(screen.getByText('Verification email sent to a@b.co.')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: 'Resend available in 60s' })
    // aria-disabled (not disabled) so keyboard focus stays on the button
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).toBeEnabled()
    await click('Resend available in 60s')
    expect(supabase.auth.resend).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByRole('button', { name: 'Resend available in 59s' })).toHaveAttribute('aria-disabled', 'true')
    for (let i = 0; i < 58; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByRole('button', { name: 'Resend available in 1s' })).toHaveAttribute('aria-disabled', 'true')
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByRole('button', { name: 'Resend verification email' })).not.toHaveAttribute('aria-disabled')
  })

  it('shows the error and no cooldown on failure', async () => {
    supabase.auth.resend.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', message: 'x' } })
    render(<ResendVerification email="a@b.co" />)
    await click('Resend verification email')
    expect(screen.getByRole('alert')).toHaveTextContent(/Too many emails/)
    const btn = screen.getByRole('button', { name: 'Resend verification email' })
    expect(btn).toBeEnabled()
    expect(screen.queryByText(/Resend available/)).not.toBeInTheDocument()
  })
})
