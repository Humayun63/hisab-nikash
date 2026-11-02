import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
vi.mock('../../lib/authErrors', async (orig) => ({ ...(await orig()), readUrlAuthError: vi.fn() }))
import { useAuth } from '../../auth/AuthProvider'
import { readUrlAuthError } from '../../lib/authErrors'
import AuthCallbackPage from './AuthCallbackPage'

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<div>ROOT</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  readUrlAuthError.mockReturnValue(null)
})

describe('AuthCallbackPage', () => {
  it('with a session calls markLogin, then navigates to "/"', async () => {
    let resolve
    const markLogin = vi.fn(() => new Promise((r) => { resolve = r }))
    useAuth.mockReturnValue({ session: { user: {} }, loading: false, markLogin })
    renderPage()
    expect(markLogin).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Signing you in')
    expect(screen.queryByText('ROOT')).not.toBeInTheDocument()
    resolve()
    await waitFor(() => expect(screen.getByText('ROOT')).toBeInTheDocument())
  })
  it('shows a spinner while loading', () => {
    useAuth.mockReturnValue({ session: null, loading: true, markLogin: vi.fn() })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Verifying')
  })
  it('without a session shows the invalid-link message', () => {
    useAuth.mockReturnValue({ session: null, loading: false, markLogin: vi.fn() })
    renderPage()
    expect(screen.getByText(/invalid or has already been used/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login')
  })
  it('shows a URL auth error', () => {
    readUrlAuthError.mockReturnValue('Link expired')
    useAuth.mockReturnValue({ session: null, loading: false, markLogin: vi.fn() })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Link expired')
  })
})
