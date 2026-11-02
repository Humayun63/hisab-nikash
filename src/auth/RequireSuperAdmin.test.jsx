import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('./AuthProvider', () => ({ useAuth: vi.fn() }))
import { useAuth } from './AuthProvider'
import RequireSuperAdmin from './RequireSuperAdmin'

function renderAt() {
  render(
    <MemoryRouter initialEntries={['/settings/users']}>
      <Routes>
        <Route element={<RequireSuperAdmin />}>
          <Route path="/settings/users" element={<div>USERS</div>} />
        </Route>
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => useAuth.mockReset())

describe('RequireSuperAdmin', () => {
  it('renders the outlet for a super admin', () => {
    useAuth.mockReturnValue({ profile: { is_super_admin: true } })
    renderAt()
    expect(screen.getByText('USERS')).toBeInTheDocument()
  })
  it.each([[{ is_super_admin: false }], [null]])('redirects %j to "/"', (profile) => {
    useAuth.mockReturnValue({ profile })
    renderAt()
    expect(screen.getByText('HOME')).toBeInTheDocument()
    expect(screen.queryByText('USERS')).not.toBeInTheDocument()
  })
})
