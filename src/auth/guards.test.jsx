import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }))
import { useAuth } from './AuthProvider'
import { GuestOnly, RequireReady, RequireStep } from './guards'

const session = { user: { id: 'u1' } }
const active = { status: 'active', must_change_password: false }

function Where() {
  const l = useLocation()
  return <div>AT {l.pathname} from={String(l.state?.from)}</div>
}

function renderAt(entry, element, path = '/target') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={element}>
          <Route path={path} element={<div>CONTENT</div>} />
        </Route>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => useAuth.mockReset())

describe('GuestOnly', () => {
  it('shows a spinner while loading', () => {
    useAuth.mockReturnValue({ loading: true, session: null })
    renderAt('/target', <GuestOnly />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByText('CONTENT')).not.toBeInTheDocument()
  })
  it('renders children for guests', () => {
    useAuth.mockReturnValue({ loading: false, session: null })
    renderAt('/target', <GuestOnly />)
    expect(screen.getByText('CONTENT')).toBeInTheDocument()
  })
  it('sends signed-in users to / by default', () => {
    useAuth.mockReturnValue({ loading: false, session })
    renderAt('/target', <GuestOnly />)
    expect(screen.getByText(/AT \/ /)).toBeInTheDocument()
  })
  it('honours location.state.from', () => {
    useAuth.mockReturnValue({ loading: false, session })
    renderAt({ pathname: '/target', state: { from: '/reports' } }, <GuestOnly />)
    expect(screen.getByText(/AT \/reports/)).toBeInTheDocument()
  })
  it('ignores external from URLs', () => {
    useAuth.mockReturnValue({ loading: false, session })
    renderAt({ pathname: '/target', state: { from: 'https://evil.example' } }, <GuestOnly />)
    expect(screen.getByText(/AT \/ /)).toBeInTheDocument()
    renderAt({ pathname: '/target', state: { from: '//evil.example' } }, <GuestOnly />)
    expect(screen.getAllByText(/AT \/ /).length).toBe(2)
  })
})

describe('RequireReady', () => {
  it('shows a spinner while loading', () => {
    useAuth.mockReturnValue({ loading: true })
    renderAt('/target', <RequireReady />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
  it('redirects signed-out users to /login carrying from', () => {
    useAuth.mockReturnValue({ loading: false, session: null })
    renderAt('/target', <RequireReady />)
    expect(screen.getByText('AT /login from=/target')).toBeInTheDocument()
  })
  it.each([
    [null, '/setup'],
    [{ status: 'disabled' }, '/account-disabled'],
    [{ status: 'active', must_change_password: true }, '/change-password'],
  ])('redirects profile %j to %s', (profile, dest) => {
    useAuth.mockReturnValue({ loading: false, session, profile })
    renderAt('/target', <RequireReady />)
    expect(screen.getByText(new RegExp(`AT ${dest}`))).toBeInTheDocument()
  })
  it('renders content for ready users', () => {
    useAuth.mockReturnValue({ loading: false, session, profile: active })
    renderAt('/target', <RequireReady />)
    expect(screen.getByText('CONTENT')).toBeInTheDocument()
  })
  it('shows a profile error with a working sign out', () => {
    const signOut = vi.fn()
    useAuth.mockReturnValue({ loading: false, session, profile: null, profileError: new Error('x'), signOut })
    renderAt('/target', <RequireReady />)
    expect(screen.getByText("We couldn't load your account")).toBeInTheDocument()
    screen.getByRole('button', { name: 'Sign out' }).click()
    expect(signOut).toHaveBeenCalled()
  })
})

describe('RequireStep', () => {
  it('shows a spinner while loading', () => {
    useAuth.mockReturnValue({ loading: true })
    renderAt('/setup', <RequireStep step="/setup" />, '/setup')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
  it('redirects signed-out users to /login', () => {
    useAuth.mockReturnValue({ loading: false, session: null })
    renderAt('/setup', <RequireStep step="/setup" />, '/setup')
    expect(screen.getByText('AT /login from=/setup')).toBeInTheDocument()
  })
  it('renders when the required route matches the step', () => {
    useAuth.mockReturnValue({ loading: false, session, profile: null })
    renderAt('/setup', <RequireStep step="/setup" />, '/setup')
    expect(screen.getByText('CONTENT')).toBeInTheDocument()
  })
  it('renders /account-disabled and /change-password for matching profiles', () => {
    useAuth.mockReturnValue({ loading: false, session, profile: { status: 'disabled' } })
    renderAt('/account-disabled', <RequireStep step="/account-disabled" />, '/account-disabled')
    expect(screen.getByText('CONTENT')).toBeInTheDocument()
  })
  it('redirects ready users away from /setup to /', () => {
    useAuth.mockReturnValue({ loading: false, session, profile: active })
    renderAt('/setup', <RequireStep step="/setup" />, '/setup')
    expect(screen.getByText(/AT \/ /)).toBeInTheDocument()
  })
  it('redirects a user with a profile away from /setup to the step they need', () => {
    useAuth.mockReturnValue({ loading: false, session, profile: { status: 'active', must_change_password: true } })
    renderAt('/setup', <RequireStep step="/setup" />, '/setup')
    expect(screen.getByText(/AT \/change-password/)).toBeInTheDocument()
  })
  it('shows profile error', () => {
    useAuth.mockReturnValue({ loading: false, session, profileError: new Error('x'), signOut: vi.fn() })
    renderAt('/setup', <RequireStep step="/setup" />, '/setup')
    expect(screen.getByText("We couldn't load your account")).toBeInTheDocument()
  })
})

describe('password recovery session', () => {
  const recovering = { loading: false, session, profile: active, recoveryMode: true }

  it.each([
    ['GuestOnly', <GuestOnly key="g" />],
    ['RequireStep', <RequireStep key="s" step="/target" />],
    ['RequireReady', <RequireReady key="r" />],
  ])('%s keeps the user on /reset-password until they set a password', (_, element) => {
    useAuth.mockReturnValue(recovering)
    renderAt('/target', element)
    expect(screen.getByText(/AT \/reset-password/)).toBeInTheDocument()
    expect(screen.queryByText('CONTENT')).not.toBeInTheDocument()
  })
})

describe('profile load error', () => {
  it('offers Try again and Sign out', async () => {
    const refreshProfile = vi.fn()
    const signOut = vi.fn()
    useAuth.mockReturnValue({ loading: false, session, profile: null, profileError: new Error('x'), refreshProfile, signOut })
    renderAt('/target', <RequireReady />)
    screen.getByRole('button', { name: 'Try again' }).click()
    screen.getByRole('button', { name: 'Sign out' }).click()
    expect(refreshProfile).toHaveBeenCalled()
    expect(signOut).toHaveBeenCalled()
  })
})
