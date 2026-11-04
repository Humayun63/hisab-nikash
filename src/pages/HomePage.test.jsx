import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { rememberLastSpace } from '../lib/lastSpace'

vi.mock('../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useOrgData', () => ({ useSpaces: vi.fn() }))

import { useAuth } from '../auth/AuthProvider'
import { useSpaces } from '../hooks/useOrgData'
import HomePage from './HomePage'

const profile = {
  id: 'u1',
  first_name: 'Ada',
  is_super_admin: false,
  organization: { name: 'Acme' },
}

const SPACES = [
  { id: 's1', name: 'Home', currency_code: 'USD', currency_symbol: '$', space_members: [{ user_id: 'u1', role: 'editor' }] },
  { id: 's2', name: 'Business', currency_code: 'BDT', currency_symbol: '৳', space_members: [{ user_id: 'u1', role: 'viewer' }] },
]

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/spaces/:spaceId/dashboard" element={<div>DASHBOARD PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useAuth.mockReturnValue({ profile })
  useSpaces.mockReturnValue({ data: SPACES, isPending: false, error: null })
})

describe('HomePage redirect', () => {
  it('opens the dashboard of the last space when it is still accessible', () => {
    rememberLastSpace('s2')
    renderHome()
    expect(screen.getByText('DASHBOARD PAGE')).toBeInTheDocument()
  })

  it('stays on the home page when the remembered space is not accessible', () => {
    rememberLastSpace('gone')
    renderHome()
    expect(screen.queryByText('DASHBOARD PAGE')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument()
  })

  it('waits for the spaces to load before deciding', () => {
    rememberLastSpace('s2')
    useSpaces.mockReturnValue({ data: undefined, isPending: true, error: null })
    renderHome()
    expect(screen.queryByText('DASHBOARD PAGE')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading spaces…')
  })

  it('shows the spaces when nothing is remembered', () => {
    renderHome()
    expect(screen.queryByText('DASHBOARD PAGE')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
  })
})

describe('HomePage space list', () => {
  it('links each space to its dashboard with its role', () => {
    renderHome()
    const home = screen.getByRole('link', { name: /Home/ })
    expect(home).toHaveAttribute('href', '/spaces/s1/dashboard')
    expect(within(home).getByText(/Editor/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Business/ })).toHaveAttribute('href', '/spaces/s2/dashboard')
  })

  it('shows an alert when the spaces fail to load', () => {
    useSpaces.mockReturnValue({ data: undefined, isPending: false, error: new Error('x') })
    renderHome()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load spaces.')
  })

  it('shows "Manage spaces" only to the super admin', () => {
    const { unmount } = renderHome()
    expect(screen.queryByRole('link', { name: 'Manage spaces' })).not.toBeInTheDocument()
    unmount()
    useAuth.mockReturnValue({ profile: { ...profile, is_super_admin: true } })
    renderHome()
    expect(screen.getByRole('link', { name: 'Manage spaces' })).toHaveAttribute('href', '/settings/spaces')
  })
})
