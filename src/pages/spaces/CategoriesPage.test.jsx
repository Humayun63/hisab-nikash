import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const calls = []
const OK = { error: null, data: [{ id: 'x' }] }
const state = { result: OK, access: [] }
function chain(table, op, args, resultFn) {
  const entry = { table, op, args, then: [] }
  calls.push(entry)
  const proxy = new Proxy(() => {}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(resultFn())
      return (...a) => {
        entry.then.push([prop, a])
        return proxy
      }
    },
  })
  return proxy
}
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table) => ({
      insert: (...a) => chain(table, 'insert', a, () => state.result),
      update: (...a) => chain(table, 'update', a, () => state.result),
      delete: (...a) => chain(table, 'delete', a, () => state.result),
      select: (...a) => chain(table, 'select', a, () => ({ data: state.access.map((user_id) => ({ user_id })), error: null })),
    })),
  },
}))
vi.mock('../../hooks/useOrgData', async (orig) => ({ ...(await orig()), useSpaceMembers: vi.fn() }))
vi.mock('../../hooks/useSpaceData', () => ({
  useCategories: vi.fn(),
  useCategoryUsage: vi.fn(),
  useSpaceRole: vi.fn(),
  useCategoryAccess: vi.fn(),
}))
import { useSpaceMembers } from '../../hooks/useOrgData'
import { useCategories, useCategoryAccess, useCategoryUsage, useSpaceRole } from '../../hooks/useSpaceData'
import { NO_ROWS_MESSAGE } from '../../lib/structureErrors'
import CategoriesPage from './CategoriesPage'

const cats = [
  { id: 'e1', name: 'Food', type: 'expense', color: '#ef4444', is_restricted: false, archived_at: null },
  { id: 'e2', name: 'Old', type: 'expense', color: '#64748b', is_restricted: false, archived_at: '2026-01-01T00:00:00Z' },
  { id: 'i1', name: 'Salary', type: 'income', color: '#22c55e', is_restricted: true, archived_at: null },
]
const members = [{ user_id: 'u1', role: 'viewer', profile: { first_name: 'Ann', last_name: 'A' } }]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/spaces/sp1/categories']}>
        <Routes>
          <Route path="/spaces/:spaceId/categories" element={<CategoriesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}
const item = (name) => screen.getByRole('listitem', { name })

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  state.result = OK
  state.access = []
  useSpaceRole.mockReturnValue({ role: 'admin', isPending: false })
  useCategories.mockReturnValue({ data: cats, isPending: false })
  useCategoryUsage.mockReturnValue({ data: { e1: 3, i1: 1 } })
  useSpaceMembers.mockReturnValue({ data: members, isPending: false })
  useCategoryAccess.mockReturnValue({ data: [], isPending: false })
})

describe('CategoriesPage list', () => {
  it('groups categories by type with counts', () => {
    renderPage()
    const expense = screen.getByRole('region', { name: /Expense/ })
    const income = screen.getByRole('region', { name: /Income/ })
    expect(within(expense).getByRole('heading')).toHaveTextContent('Expense (2)')
    expect(within(income).getByRole('heading')).toHaveTextContent('Income (1)')
    expect(within(expense).getByRole('listitem', { name: 'Food' })).toHaveTextContent('3 entries')
    expect(within(income).getByRole('listitem', { name: 'Salary' })).toHaveTextContent('1 entry')
    expect(item('Old')).toHaveTextContent('0 entries')
  })
  it('marks archived and restricted categories', () => {
    renderPage()
    expect(item('Old')).toHaveTextContent('Archived')
    expect(item('Salary')).toHaveTextContent('Selected members only')
    expect(item('Food')).not.toHaveTextContent('Archived')
  })
  it('shows empty messages for a type with no categories', () => {
    useCategories.mockReturnValue({ data: [cats[0]], isPending: false })
    renderPage()
    expect(screen.getByText('No income categories yet.')).toBeInTheDocument()
  })
  it('shows loading and error states', () => {
    useCategories.mockReturnValue({ data: undefined, isPending: true })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading categories…')
  })
  it('shows a spinner and no lists until usage has loaded', () => {
    useCategoryUsage.mockReturnValue({ data: undefined, isPending: true })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading categories…')
    expect(screen.queryByRole('listitem', { name: 'Old' })).not.toBeInTheDocument()
    expect(screen.queryByText(/0 entries/)).not.toBeInTheDocument()
  })
  it('shows a load error', () => {
    useCategories.mockReturnValue({ data: undefined, isPending: false, error: new Error('x') })
    useCategoryUsage.mockReturnValue({ data: undefined })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load categories')
  })
})

describe('CategoriesPage per-category actions', () => {
  it('offers delete only for categories with 0 entries', () => {
    renderPage()
    expect(within(item('Food')).queryByRole('button', { name: 'Delete Food' })).not.toBeInTheDocument()
    expect(within(item('Salary')).queryByRole('button', { name: 'Delete Salary' })).not.toBeInTheDocument()
    expect(within(item('Old')).getByRole('button', { name: 'Delete Old' })).toBeInTheDocument()
  })
  it('shows Restore for archived and Archive otherwise', () => {
    renderPage()
    expect(within(item('Old')).getByRole('button', { name: 'Restore Old' })).toBeInTheDocument()
    expect(within(item('Food')).getByRole('button', { name: 'Archive Food' })).toBeInTheDocument()
  })
  it('hides Visibility from admins', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /^Visibility of/ })).not.toBeInTheDocument()
  })
  it('shows Visibility to the super admin', () => {
    useSpaceRole.mockReturnValue({ role: 'super_admin', isPending: false })
    renderPage()
    expect(screen.getByRole('button', { name: 'Visibility of Food' })).toBeInTheDocument()
  })
})

describe('CategoriesPage mutations', () => {
  it('creates a category in this space', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Category name'), 'Fuel')
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByText('Created Fuel.')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'categories', op: 'insert' })
    expect(calls[0].args[0]).toEqual({ name: 'Fuel', type: 'expense', color: '#ef4444', space_id: 'sp1' })
  })

  it('shows a duplicate error inside the dialog', async () => {
    state.result = { error: { code: '23505' }, data: null }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'New category' }))
    await user.type(screen.getByLabelText('Category name'), 'Food')
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByText('A category with this name already exists.')).toBeInTheDocument()
  })

  it('edits a category; type is editable when it has no entries', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Old' }))
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Saved Old.')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'categories', op: 'update' })
    expect(calls[0].then).toEqual([['eq', ['id', 'e2']], ['select', ['id']]])
  })

  it('locks the type when editing a category with entries', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Food' }))
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText(/already has entries/)).toBeInTheDocument()
  })

  it('archives a category with a timestamp', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Archive Food' }))
    expect(await screen.findByText(/Food was archived/)).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'categories', op: 'update' })
    expect(typeof calls[0].args[0].archived_at).toBe('string')
    expect(calls[0].then).toEqual([['eq', ['id', 'e1']], ['select', ['id']]])
  })

  it('restores an archived category', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Restore Old' }))
    expect(await screen.findByText('Old was restored.')).toBeInTheDocument()
    expect(calls[0].args[0]).toEqual({ archived_at: null })
  })

  it('shows an error notice when archiving fails', async () => {
    state.result = { error: { code: '42501', message: 'rls' }, data: null }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Archive Food' }))
    expect(await screen.findByText("You don't have permission to do that.")).toBeInTheDocument()
  })

  it('shows NO_ROWS_MESSAGE when an update changes no rows', async () => {
    state.result = { error: null, data: [] }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Archive Food' }))
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
  })

  it('shows NO_ROWS_MESSAGE in the dialog when an edit changes no rows', async () => {
    state.result = { error: null, data: [] }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Old' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows NO_ROWS_MESSAGE when a delete changes no rows', async () => {
    state.result = { error: null, data: [] }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete Old' }))
    await user.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(await screen.findByText(NO_ROWS_MESSAGE)).toBeInTheDocument()
  })

  it('shows the friendly message when the type change is refused', async () => {
    state.result = { error: { code: '23514', message: 'Cannot change the type of a category that has entries' }, data: null }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Old' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText("This category already has entries, so its type can't be changed.")).toBeInTheDocument()
  })

  it('deletes an empty category only after confirming', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete Old' }))
    expect(screen.getByRole('dialog', { name: 'Delete Old?' })).toBeInTheDocument()
    expect(calls).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(await screen.findByText('Old was deleted.')).toBeInTheDocument()
    expect(calls[0]).toMatchObject({ table: 'categories', op: 'delete' })
    expect(calls[0].then).toEqual([['eq', ['id', 'e2']], ['select', ['id']]])
  })

  it('shows the database refusal when deleting a category that gained entries', async () => {
    state.result = { error: { code: '23503' }, data: null }
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete Old' }))
    await user.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(await screen.findByText(/still has entries/)).toBeInTheDocument()
  })
})

describe('CategoriesPage visibility (super admin)', () => {
  beforeEach(() => useSpaceRole.mockReturnValue({ role: 'super_admin', isPending: false }))

  it('restricts a public category to selected members', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Visibility of Food' }))
    await user.click(screen.getByLabelText('Only selected members'))
    await user.click(screen.getByLabelText(/Ann A/))
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    expect(await screen.findByText('Food is now visible to selected members only.')).toBeInTheDocument()
    const update = calls.find((c) => c.table === 'categories' && c.op === 'update')
    expect(update.args[0]).toEqual({ is_restricted: true })
    expect(update.then).toEqual([['eq', ['id', 'e1']], ['select', ['id']]])
    const insert = calls.find((c) => c.table === 'category_access' && c.op === 'insert')
    expect(insert.args[0]).toEqual([{ category_id: 'e1', user_id: 'u1' }])
  })

  it('syncs the access list of an already restricted category (add and remove)', async () => {
    state.access = ['u2']
    useCategoryAccess.mockReturnValue({ data: ['u2'], isPending: false })
    useSpaceMembers.mockReturnValue({
      data: [...members, { user_id: 'u2', role: 'editor', profile: { first_name: 'Bob', last_name: 'B' } }],
      isPending: false,
    })
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Visibility of Salary' }))
    await user.click(screen.getByLabelText(/Ann A/))
    await user.click(screen.getByLabelText(/Bob B/))
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    expect(await screen.findByText('Salary is now visible to selected members only.')).toBeInTheDocument()
    // still restricted: no category update
    expect(calls.some((c) => c.table === 'categories' && c.op === 'update')).toBe(false)
    expect(calls.find((c) => c.table === 'category_access' && c.op === 'insert').args[0]).toEqual([{ category_id: 'i1', user_id: 'u1' }])
    const del = calls.find((c) => c.table === 'category_access' && c.op === 'delete')
    expect(del.then).toEqual([['eq', ['category_id', 'i1']], ['in', ['user_id', ['u2']]]])
  })

  it('makes a restricted category visible to everyone', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: 'Visibility of Salary' }))
    await user.click(screen.getByLabelText('Everyone in this space'))
    await user.click(screen.getByRole('button', { name: 'Save visibility' }))
    expect(await screen.findByText('Salary is now visible to everyone in this space.')).toBeInTheDocument()
    const update = calls.find((c) => c.table === 'categories' && c.op === 'update')
    expect(update.args[0]).toEqual({ is_restricted: false })
    expect(calls.some((c) => c.table === 'category_access' && c.op !== 'select')).toBe(false)
  })
})
