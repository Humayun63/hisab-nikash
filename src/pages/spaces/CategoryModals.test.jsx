import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../hooks/useOrgData', async (orig) => ({ ...(await orig()), useSpaceMembers: vi.fn() }))
vi.mock('../../hooks/useSpaceData', () => ({ useCategoryAccess: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
import { useSpaceMembers } from '../../hooks/useOrgData'
import { useCategoryAccess } from '../../hooks/useSpaceData'
import { CategoryFormModal, CategoryVisibilityModal } from './CategoryModals'

describe('CategoryFormModal', () => {
  function setup(props = {}) {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<CategoryFormModal hasEntries={false} onSubmit={onSubmit} onClose={onClose} {...props} />)
    return { onSubmit, onClose, user: userEvent.setup() }
  }

  it('creates with defaults expense and the first color', async () => {
    const { onSubmit, user } = setup({ category: null })
    expect(screen.getByRole('dialog', { name: 'New category' })).toBeInTheDocument()
    expect(screen.getByLabelText('Expense')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('Category name'), '  Food ')
    await user.click(screen.getByLabelText('Income'))
    await user.click(screen.getByRole('button', { name: 'Blue' }))
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Food', type: 'income', color: '#3b82f6' })
  })

  it('validates the name', async () => {
    const { onSubmit, user } = setup({ category: null })
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('prefills when editing and lets the type change if no entries', async () => {
    const category = { id: 'c1', name: 'Salary', type: 'income', color: '#22c55e' }
    const { onSubmit, user } = setup({ category })
    expect(screen.getByRole('dialog', { name: 'Edit Salary' })).toBeInTheDocument()
    expect(screen.getByLabelText('Category name')).toHaveValue('Salary')
    expect(screen.getByLabelText('Income')).toBeChecked()
    await user.click(screen.getByLabelText('Expense'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Salary', type: 'expense', color: '#22c55e' })
  })

  it('locks the type when the category has entries, but still submits it', async () => {
    const category = { id: 'c1', name: 'Salary', type: 'income', color: '#22c55e' }
    const { onSubmit, user } = setup({ category, hasEntries: true })
    expect(screen.queryByLabelText('Expense')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText(/type can't change because this category already has entries/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Category name'))
    await user.type(screen.getByLabelText('Category name'), 'Pay')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Pay', type: 'income', color: '#22c55e' })
  })

  it('shows the error thrown by onSubmit', async () => {
    const { onSubmit, user } = setup({ category: null })
    onSubmit.mockRejectedValue(new Error('A category with this name already exists.'))
    await user.type(screen.getByLabelText('Category name'), 'Food')
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByText('A category with this name already exists.')).toBeInTheDocument()
  })

  it('closes with Cancel', async () => {
    const { onClose, user } = setup({ category: null })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('CategoryVisibilityModal', () => {
  const members = [
    { user_id: 'u1', role: 'viewer', profile: { first_name: 'Ann', last_name: 'A' } },
    { user_id: 'u2', role: 'editor', profile: { first_name: 'Bob', last_name: 'B' } },
  ]
  const open = { id: 'c1', name: 'Secret', is_restricted: false }
  const restricted = { id: 'c1', name: 'Secret', is_restricted: true }

  beforeEach(() => {
    vi.clearAllMocks()
    useSpaceMembers.mockReturnValue({ data: members, isPending: false })
    useCategoryAccess.mockReturnValue({ data: [], isPending: false })
  })

  function setup(category) {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<CategoryVisibilityModal spaceId="sp1" category={category} onSubmit={onSubmit} onClose={onClose} />)
    return { onSubmit, onClose, user: userEvent.setup() }
  }

  it('only loads access for restricted categories', () => {
    setup(open)
    expect(useCategoryAccess).toHaveBeenCalledWith('c1', false)
    setup(restricted)
    expect(useCategoryAccess).toHaveBeenCalledWith('c1', true)
  })

  it('shows a spinner while members load', () => {
    useSpaceMembers.mockReturnValue({ isPending: true })
    setup(open)
    expect(screen.getByRole('status')).toHaveTextContent('Loading members…')
  })
  it('shows a spinner while access loads for a restricted category', () => {
    useCategoryAccess.mockReturnValue({ isPending: true })
    setup(restricted)
    expect(screen.getByRole('status')).toHaveTextContent('Loading members…')
  })

  it('defaults to everyone for an unrestricted category, with no member list', () => {
    setup(open)
    expect(screen.getByLabelText('Everyone in this space')).toBeChecked()
    expect(screen.queryByRole('group', { name: 'Members who can see it' })).not.toBeInTheDocument()
  })

  it('preselects members with access for a restricted category', () => {
    useCategoryAccess.mockReturnValue({ data: ['u2'], isPending: false })
    setup(restricted)
    expect(screen.getByLabelText('Only selected members')).toBeChecked()
    expect(screen.getByLabelText(/Ann A/)).not.toBeChecked()
    expect(screen.getByLabelText(/Bob B/)).toBeChecked()
    expect(screen.getByLabelText(/Bob B/)).toHaveAccessibleName(/Editor/)
  })

  it('restricts to the chosen members', async () => {
    const { onSubmit, user } = setup(open)
    await user.click(screen.getByLabelText('Only selected members'))
    await user.click(screen.getByLabelText(/Ann A/))
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    expect(onSubmit).toHaveBeenCalledWith({ restricted: true, userIds: ['u1'] })
  })

  it('submits everyone-visibility', async () => {
    useCategoryAccess.mockReturnValue({ data: ['u1'], isPending: false })
    const { onSubmit, user } = setup(restricted)
    await user.click(screen.getByLabelText('Everyone in this space'))
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    expect(onSubmit).toHaveBeenCalledWith({ restricted: false, userIds: ['u1'] })
  })

  it('lets members be unchecked', async () => {
    useCategoryAccess.mockReturnValue({ data: ['u1', 'u2'], isPending: false })
    const { onSubmit, user } = setup(restricted)
    await user.click(screen.getByLabelText(/Ann A/))
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    expect(onSubmit).toHaveBeenCalledWith({ restricted: true, userIds: ['u2'] })
  })

  it('explains an empty member list', async () => {
    useSpaceMembers.mockReturnValue({ data: [], isPending: false })
    const { user } = setup(open)
    await user.click(screen.getByLabelText('Only selected members'))
    expect(screen.getByText(/no members yet, so only you will see/)).toBeInTheDocument()
  })

  it('shows the error from onSubmit', async () => {
    const { onSubmit, user } = setup(open)
    onSubmit.mockRejectedValue(new Error('denied'))
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('denied')).toBeInTheDocument()
  })

  it('shows a load error', () => {
    useSpaceMembers.mockReturnValue({ data: undefined, isPending: false, error: new Error('x') })
    setup(open)
    expect(screen.getByText('Could not load members.')).toBeInTheDocument()
  })
})
