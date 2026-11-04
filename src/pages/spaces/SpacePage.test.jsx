import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../hooks/useOrgData', () => ({ useSpace: vi.fn() }))
vi.mock('../../hooks/useSpaceData', () => ({ useSpaceRole: vi.fn(), useFolders: vi.fn(), useCategories: vi.fn() }))
import { useSpace } from '../../hooks/useOrgData'
import { useCategories, useFolders, useSpaceRole } from '../../hooks/useSpaceData'
import SpacePage from './SpacePage'

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/spaces/sp1']}>
      <Routes>
        <Route path="/spaces/:spaceId" element={<SpacePage />} />
      </Routes>
    </MemoryRouter>,
  )
}
const stat = (label) => screen.getByText(label).closest('div')

beforeEach(() => {
  vi.clearAllMocks()
  useSpace.mockReturnValue({ data: { id: 'sp1', name: 'Household', description: 'Home money' } })
  useSpaceRole.mockReturnValue({ role: 'admin' })
  useFolders.mockReturnValue({ data: [{ id: 'a', files: [{}, {}] }, { id: 'b', files: [{}] }] })
  useCategories.mockReturnValue({ data: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }] })
})

describe('SpacePage', () => {
  it('renders nothing until the space loads', () => {
    useSpace.mockReturnValue({ data: undefined })
    renderPage()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
  it('shows the description and counts', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('Home money')).toBeInTheDocument()
    expect(stat('Folders')).toHaveTextContent('2')
    expect(stat('Files')).toHaveTextContent('3')
    expect(stat('Categories')).toHaveTextContent('4')
  })
  it('shows placeholders while loading', () => {
    useFolders.mockReturnValue({ data: undefined })
    useCategories.mockReturnValue({ data: undefined })
    renderPage()
    expect(stat('Folders')).toHaveTextContent('…')
    expect(stat('Categories')).toHaveTextContent('…')
  })
  it('guides an admin with no folders, linking to categories when there are none', () => {
    useFolders.mockReturnValue({ data: [] })
    useCategories.mockReturnValue({ data: [] })
    renderPage()
    expect(screen.getByText(/Start by creating a folder/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'categories' })).toHaveAttribute('href', '/spaces/sp1/categories')
  })
  it('omits the categories link when categories exist', () => {
    useFolders.mockReturnValue({ data: [] })
    renderPage()
    expect(screen.getByText(/Start by creating a folder/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'categories' })).not.toBeInTheDocument()
  })
  it('shows no setup hint to non-admins', () => {
    useSpaceRole.mockReturnValue({ role: 'viewer' })
    useFolders.mockReturnValue({ data: [] })
    renderPage()
    expect(screen.queryByText(/Start by creating a folder/)).not.toBeInTheDocument()
  })
  it('shows no setup hint when folders exist', () => {
    renderPage()
    expect(screen.queryByText(/Start by creating a folder/)).not.toBeInTheDocument()
  })
})
