import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Combobox from './Combobox'
import { CATEGORY_GROUPS } from '../../lib/entries'

const options = [
  { value: 'c1', label: 'Groceries', group: 'expense' },
  { value: 'c2', label: 'Salary', group: 'income' },
  { value: 'c3', label: 'Rent', group: 'expense', color: '#ff0000' },
]

function renderCombobox(props = {}) {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(
    <Combobox label="Category" options={options} groups={CATEGORY_GROUPS} value="" onChange={onChange} placeholder="Search…" {...props} />,
  )
  return { user, onChange, input: screen.getByRole('combobox', { name: 'Category' }) }
}

describe('Combobox', () => {
  it('is a labelled combobox that starts closed', () => {
    const { input } = renderCombobox()
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('placeholder', 'Search…')
  })

  it('opens on click and sets aria-expanded and aria-controls', async () => {
    const { user, input } = renderCombobox()
    await user.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    const listbox = screen.getByRole('listbox', { name: 'Category' })
    expect(input).toHaveAttribute('aria-controls', listbox.id)
  })

  it('shows options under their group headings in group order', async () => {
    const { user, input } = renderCombobox()
    await user.click(input)
    const listbox = screen.getByRole('listbox', { name: 'Category' })
    expect(within(listbox).getByText('Expense')).toBeInTheDocument()
    expect(within(listbox).getByText('Income')).toBeInTheDocument()
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['Groceries', 'Rent', 'Salary'])
  })

  it('filters options as you type, ignoring case', async () => {
    const { user, input } = renderCombobox()
    await user.type(input, 'SAL')
    const listbox = screen.getByRole('listbox', { name: 'Category' })
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['Salary'])
    expect(within(listbox).queryByText('Expense')).not.toBeInTheDocument()
  })

  it('moves the highlight with ArrowDown and picks it with Enter', async () => {
    const { user, input, onChange } = renderCombobox()
    await user.click(input)
    // Groceries is highlighted first; ArrowDown moves to Rent.
    await user.keyboard('{ArrowDown}')
    const listbox = screen.getByRole('listbox', { name: 'Category' })
    const rent = within(listbox).getByRole('option', { name: 'Rent' })
    expect(input).toHaveAttribute('aria-activedescendant', rent.id)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('c3')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('Enter picks the only match while typing', async () => {
    const { user, input, onChange } = renderCombobox()
    await user.type(input, 'sal')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('c2')
  })

  it('Enter does nothing while the list is closed, so the form can submit', async () => {
    const { user, input, onChange } = renderCombobox()
    input.focus()
    await user.keyboard('{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Escape closes the list without reaching a parent handler', async () => {
    const parentKeyDown = vi.fn()
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <div onKeyDown={parentKeyDown}>
        <Combobox label="Category" options={options} groups={CATEGORY_GROUPS} value="" onChange={onChange} />
      </div>,
    )
    const input = screen.getByRole('combobox', { name: 'Category' })
    await user.click(input)
    await user.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(parentKeyDown.mock.calls.some(([e]) => e.key === 'Escape')).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('picks an option when it is clicked', async () => {
    const { user, input, onChange } = renderCombobox()
    await user.click(input)
    await user.click(screen.getByRole('option', { name: 'Groceries' }))
    expect(onChange).toHaveBeenCalledWith('c1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows the selected option label and marks it aria-selected', async () => {
    const { user, input } = renderCombobox({ value: 'c2' })
    expect(input).toHaveValue('Salary')
    await user.click(input)
    expect(screen.getByRole('option', { name: /Salary/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Groceries' })).toHaveAttribute('aria-selected', 'false')
  })

  it('shows an error that is linked to the input', () => {
    renderCombobox({ error: 'Choose a category' })
    const input = screen.getByRole('combobox', { name: 'Category' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Choose a category')
  })
})
