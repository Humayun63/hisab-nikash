import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { StatusBadge } from './Badge'
import { Checkbox } from './Checkbox'

describe('Modal', () => {
  it('renders title, description and children when open', () => {
    render(<Modal open title="Hello" description="Some detail" onClose={() => {}}><p>Body</p></Modal>)
    expect(screen.getByRole('dialog', { name: 'Hello' })).toHaveAccessibleDescription('Some detail')
    expect(screen.getByText('Body')).toBeInTheDocument()
  })
  it('renders nothing when closed', () => {
    render(<Modal open={false} title="Hello" onClose={() => {}}>x</Modal>)
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
  })
  it('close button calls onClose', async () => {
    const onClose = vi.fn()
    render(<Modal open title="T" onClose={onClose}>x</Modal>)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('the dialog cancel event (Escape) calls onClose and is default-prevented', () => {
    const onClose = vi.fn()
    render(<Modal open title="T" onClose={onClose}>x</Modal>)
    const ev = new Event('cancel', { bubbles: false, cancelable: true })
    document.querySelector('dialog').dispatchEvent(ev)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(ev.defaultPrevented).toBe(true)
  })
  it('does not close on outside (backdrop) or inner clicks, so forms are not lost', () => {
    const onClose = vi.fn()
    render(<Modal open title="T" onClose={onClose}><p>inner</p></Modal>)
    fireEvent.click(screen.getByText('inner'))
    fireEvent.click(document.querySelector('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('focuses the first field and returns focus to the opener when closed', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { rerender } = render(<Modal open title="T" onClose={() => {}}><input aria-label="Name" /></Modal>)
    expect(screen.getByLabelText('Name')).toHaveFocus()
    rerender(<Modal open={false} title="T" onClose={() => {}}><input aria-label="Name" /></Modal>)
    expect(opener).toHaveFocus()
    opener.remove()
  })
})

describe('ConfirmDialog', () => {
  function setup(props = {}) {
    const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue()
    const onClose = vi.fn()
    render(<ConfirmDialog open title="Delete?" confirmLabel="Delete it" onConfirm={onConfirm} onClose={onClose} {...props} />)
    return { onConfirm, onClose, user: userEvent.setup() }
  }

  it('without confirmText the button is enabled and calls onConfirm', async () => {
    const { onConfirm, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
  it('with confirmText the button stays disabled until the exact text is typed', async () => {
    const { onConfirm, user } = setup({ confirmText: 'My Space' })
    const btn = screen.getByRole('button', { name: 'Delete it' })
    expect(btn).toBeDisabled()
    const input = screen.getByLabelText('Type "My Space" to confirm')
    await user.type(input, 'my space')
    expect(btn).toBeDisabled()
    await user.clear(input)
    await user.type(input, 'My Space')
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(onConfirm).toHaveBeenCalled()
  })
  it('shows the error thrown by onConfirm', async () => {
    const { user } = setup({ onConfirm: vi.fn().mockRejectedValue(new Error('Nope, failed')) })
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope, failed')
  })
  it('cancel calls onClose and clears typed text', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<ConfirmDialog open title="T" confirmLabel="Go" confirmText="abc" onConfirm={vi.fn()} onClose={onClose} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Type "abc"/), 'abc')
    expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(<ConfirmDialog open title="T" confirmLabel="Go" confirmText="abc" onConfirm={vi.fn()} onClose={onClose} />)
    expect(screen.getByLabelText(/Type "abc"/)).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
  })
})

describe('StatusBadge', () => {
  it.each([
    ['invited', 'Invited'],
    ['active', 'Active'],
    ['disabled', 'Disabled'],
    ['weird', 'weird'],
  ])('%s -> %s', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('Checkbox', () => {
  it('associates the label and hint with the input', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="Enabled" hint="Some hint" onChange={onChange} />)
    const box = screen.getByLabelText('Enabled')
    expect(box).toHaveAttribute('type', 'checkbox')
    expect(box).toHaveAccessibleDescription('Some hint')
    await userEvent.click(screen.getByText('Enabled'))
    expect(box).toBeChecked()
    expect(onChange).toHaveBeenCalled()
  })
})
