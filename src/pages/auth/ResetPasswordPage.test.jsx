import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { auth: { updateUser: vi.fn() } } }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../auth/AuthProvider'
import ResetPasswordPage from './ResetPasswordPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const base = { loading: false, session: { user: { id: 'u1' } }, recoveryMode: true, finishRecovery: vi.fn(), refreshProfile: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  window.location.hash = ''
})

describe('ResetPasswordPage', () => {
  it('shows "Link not valid" without a session', () => {
    useAuth.mockReturnValue({ ...base, session: null })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Link not valid' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows the error from an expired link', () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'
    useAuth.mockReturnValue(base)
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent(/expired/)
  })

  it('sends a normally signed-in user (no reset link) home', () => {
    useAuth.mockReturnValue({ ...base, recoveryMode: false })
    renderPage()
    expect(screen.getByText('HOME')).toBeInTheDocument()
  })

  it('sets the password, ends recovery mode and goes home', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: null })
    useAuth.mockReturnValue(base)
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText('New password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByText('HOME')).toBeInTheDocument()
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' })
    expect(base.finishRecovery).toHaveBeenCalled()
  })
})
