import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SpaceForm, { spaceErrorMessage } from './SpaceForm'

describe('spaceErrorMessage', () => {
  it('maps unique violation 23505', () => {
    expect(spaceErrorMessage({ code: '23505', message: 'dup' })).toBe('A space with this name already exists.')
  })
  it('uses the error message otherwise, with a generic fallback', () => {
    expect(spaceErrorMessage({ message: 'oops' })).toBe('oops')
    expect(spaceErrorMessage(undefined)).toMatch(/Something went wrong/)
  })
})

describe('SpaceForm', () => {
  it('validates the name', async () => {
    const onSubmit = vi.fn()
    render(<SpaceForm submitLabel="Create" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('Space name is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('submits currency code and symbol, null description when empty', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(<SpaceForm submitLabel="Create" onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Space name'), '  Home ')
    await user.selectOptions(screen.getByLabelText('Currency'), 'USD')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Home', description: null, currency_code: 'USD', currency_symbol: '$' })
  })
  it('defaults to BDT with the taka symbol and prefills from space', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    const { unmount } = render(<SpaceForm submitLabel="Create" onSubmit={onSubmit} />)
    expect(screen.getByLabelText('Currency')).toHaveValue('BDT')
    unmount()
    render(<SpaceForm submitLabel="Save" onSubmit={onSubmit} space={{ name: 'Biz', description: 'd', currency_code: 'EUR', currency_symbol: '€' }} />)
    expect(screen.getByLabelText('Space name')).toHaveValue('Biz')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Biz', description: 'd', currency_code: 'EUR', currency_symbol: '€' })
  })
  it('shows a duplicate-name error from a 23505 rejection', async () => {
    const user = userEvent.setup()
    render(<SpaceForm submitLabel="Create" onSubmit={vi.fn().mockRejectedValue({ code: '23505' })} />)
    await user.type(screen.getByLabelText('Space name'), 'Home')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A space with this name already exists.')
  })
  it('cancel button calls onCancel', async () => {
    const onCancel = vi.fn()
    render(<SpaceForm submitLabel="Create" onSubmit={vi.fn()} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
