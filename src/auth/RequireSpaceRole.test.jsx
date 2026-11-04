import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../hooks/useSpaceData', () => ({ useSpaceRole: vi.fn() }))
import { useSpaceRole } from '../hooks/useSpaceData'
import RequireSpaceRole from './RequireSpaceRole'

function renderGuard(min) {
  render(
    <MemoryRouter initialEntries={['/spaces/s1/categories']}>
      <Routes>
        <Route path="/spaces/:spaceId" element={<div>OVERVIEW</div>} />
        <Route path="/spaces/:spaceId/categories" element={<RequireSpaceRole min={min} />}>
          <Route index element={<div>SECRET</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => useSpaceRole.mockReset())

describe('RequireSpaceRole', () => {
  it('shows a spinner while loading', () => {
    useSpaceRole.mockReturnValue({ role: null, isPending: true })
    renderGuard('admin')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument()
    expect(screen.queryByText('OVERVIEW')).not.toBeInTheDocument()
  })
  it.each(['admin', 'super_admin'])('lets %s through', (role) => {
    useSpaceRole.mockReturnValue({ role, isPending: false })
    renderGuard('admin')
    expect(screen.getByText('SECRET')).toBeInTheDocument()
  })
  it.each(['viewer', 'editor', null])('redirects %s to the overview', (role) => {
    useSpaceRole.mockReturnValue({ role, isPending: false })
    renderGuard('admin')
    expect(screen.getByText('OVERVIEW')).toBeInTheDocument()
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument()
  })
  it('shows an alert instead of redirecting when the spaces query errors', () => {
    useSpaceRole.mockReturnValue({ role: null, isPending: false, error: new Error('x') })
    renderGuard('admin')
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your access')
    expect(screen.queryByText('OVERVIEW')).not.toBeInTheDocument()
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument()
  })
  it('honours a super_admin minimum', () => {
    useSpaceRole.mockReturnValue({ role: 'admin', isPending: false })
    renderGuard('super_admin')
    expect(screen.getByText('OVERVIEW')).toBeInTheDocument()
  })
})
