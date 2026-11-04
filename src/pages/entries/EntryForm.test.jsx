import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const insertResult = { current: { data: null, error: null } }
const updateResult = { current: { data: [{ id: 'e1' }], error: null } }
const insert = vi.fn(() => Promise.resolve(insertResult.current))
const select = vi.fn(() => Promise.resolve(updateResult.current))
const eq = vi.fn(() => ({ select }))
const update = vi.fn(() => ({ eq }))
vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: vi.fn(() => ({ insert, update })) },
}))

const categoriesState = { current: [] }
vi.mock('../../hooks/useSpaceData', () => ({
  useCategories: vi.fn(() => ({ data: categoriesState.current })),
}))
const invalidateEntryData = vi.fn(() => Promise.resolve())
vi.mock('../../hooks/useEntries', () => ({
  useOrgToday: vi.fn(() => '2026-11-04'),
  invalidateEntryData: (...args) => invalidateEntryData(...args),
}))

import { QuickAddForm, EditEntryModal } from './EntryForm'

const space = { id: 'sp1', name: 'Home', currency_code: 'USD', currency_symbol: '$' }
const CATEGORIES = [
  { id: 'c1', name: 'Groceries', type: 'expense', color: '#0f0', archived_at: null },
  { id: 'c2', name: 'Salary', type: 'income', color: '#00f', archived_at: null },
  { id: 'c3', name: 'Old gym', type: 'expense', color: '#f00', archived_at: '2026-01-01T00:00:00Z' },
]

function renderWith(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

async function pickCategory(user, name) {
  await user.click(screen.getByRole('combobox', { name: 'Category' }))
  await user.click(screen.getByRole('option', { name }))
}

beforeEach(() => {
  vi.clearAllMocks()
  insertResult.current = { data: null, error: null }
  updateResult.current = { data: [{ id: 'e1' }], error: null }
  categoriesState.current = CATEGORIES
})

describe('QuickAddForm', () => {
  it('shows validation errors and does not save when the form is empty', async () => {
    const user = userEvent.setup()
    renderWith(<QuickAddForm space={space} fileId="f1" />)
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Amount is required')).toBeInTheDocument()
    expect(screen.getByText('Choose a category')).toBeInTheDocument()
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects a future date', async () => {
    const user = userEvent.setup()
    renderWith(<QuickAddForm space={space} fileId="f1" />)
    await user.type(screen.getByLabelText('Amount'), '10')
    await pickCategory(user, 'Groceries')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-05' } })
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText("The date can't be in the future")).toBeInTheDocument()
    expect(insert).not.toHaveBeenCalled()
  })

  it('saves, keeps the category and date, and clears amount and note', async () => {
    const user = userEvent.setup()
    renderWith(<QuickAddForm space={space} fileId="f1" />)
    await user.type(screen.getByLabelText('Amount'), '250')
    await pickCategory(user, 'Groceries')
    await user.type(screen.getByLabelText('Note'), 'Weekly shop')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(insert).toHaveBeenCalledWith({
      amount: '250',
      category_id: 'c1',
      entry_date: '2026-11-04',
      note: 'Weekly shop',
      space_id: 'sp1',
      file_id: 'f1',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/Saved .*250\.00 · Groceries/)
    expect(screen.getByLabelText('Amount')).toHaveValue('')
    expect(screen.getByLabelText('Note')).toHaveValue('')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-04')
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('Groceries')
    expect(invalidateEntryData).toHaveBeenCalledWith(expect.anything(), 'sp1')
  })

  it('shows the server error and keeps what was typed', async () => {
    insertResult.current = { data: null, error: { code: '42501', message: 'rls' } }
    const user = userEvent.setup()
    renderWith(<QuickAddForm space={space} fileId="f1" />)
    await user.type(screen.getByLabelText('Amount'), '40')
    await pickCategory(user, 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have permission to do that.")
    expect(screen.getByLabelText('Amount')).toHaveValue('40')
    expect(invalidateEntryData).not.toHaveBeenCalled()
  })

  it('explains that there are no categories yet', () => {
    categoriesState.current = []
    renderWith(<QuickAddForm space={space} fileId="f1" />)
    expect(screen.getByText(/There are no categories to choose from yet/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveAttribute('placeholder', 'No categories yet')
  })
})

describe('EditEntryModal', () => {
  const entry = {
    id: 'e1',
    amount: 12.5,
    category_id: 'c1',
    category_name: 'Groceries',
    entry_date: '2026-11-01',
    note: null,
  }

  it('starts with the entry values', () => {
    renderWith(<EditEntryModal space={space} entry={entry} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Edit entry' })
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('12.50')
    expect(within(dialog).getByRole('combobox', { name: 'Category' })).toHaveValue('Groceries')
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-01')
    expect(within(dialog).getByLabelText('Note')).toHaveValue('')
  })

  it('saves the changes to that entry and closes', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWith(<EditEntryModal space={space} entry={entry} onClose={onClose} />)
    const amount = screen.getByLabelText('Amount')
    await user.clear(amount)
    await user.type(amount, '30')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(update).toHaveBeenCalledWith({ amount: '30', category_id: 'c1', entry_date: '2026-11-01', note: null })
    expect(eq).toHaveBeenCalledWith('id', 'e1')
    expect(select).toHaveBeenCalledWith('id')
    expect(invalidateEntryData).toHaveBeenCalledWith(expect.anything(), 'sp1')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a message when the row was filtered out by permissions', async () => {
    updateResult.current = { data: [], error: null }
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWith(<EditEntryModal space={space} entry={entry} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('It may have been deleted, or you no longer have permission.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel closes without saving', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWith(<EditEntryModal space={space} entry={entry} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
