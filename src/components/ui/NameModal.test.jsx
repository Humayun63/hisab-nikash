import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NameModal from './NameModal'

function setup(props = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(<NameModal open title="New folder" label="Folder name" submitLabel="Create folder" onSubmit={onSubmit} onClose={onClose} {...props} />)
  return { onSubmit, onClose, user: userEvent.setup() }
}

describe('NameModal', () => {
  it('renders nothing when closed', () => {
    render(<NameModal open={false} title="New folder" submitLabel="Go" onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the title, labelled field and prefilled initial name', () => {
    setup({ initialName: 'Bills' })
    expect(screen.getByRole('dialog', { name: 'New folder' })).toBeInTheDocument()
    expect(screen.getByLabelText('Folder name')).toHaveValue('Bills')
  })

  it('submits the trimmed name', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Folder name'), '  Rent  ')
    await user.click(screen.getByRole('button', { name: 'Create folder' }))
    expect(onSubmit).toHaveBeenCalledWith('Rent')
  })

  it('validates an empty name without submitting', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create folder' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects names over 100 characters', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByLabelText('Folder name'))
    await user.paste('a'.repeat(101))
    await user.click(screen.getByRole('button', { name: 'Create folder' }))
    expect(await screen.findByText('Must be 100 characters or fewer')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the error thrown by onSubmit and stays open', async () => {
    const { onSubmit, onClose, user } = setup()
    onSubmit.mockRejectedValue(new Error('A folder with this name already exists.'))
    await user.type(screen.getByLabelText('Folder name'), 'Dup')
    await user.click(screen.getByRole('button', { name: 'Create folder' }))
    expect(await screen.findByText('A folder with this name already exists.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose from Cancel', async () => {
    const { onClose, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('uses the default label "Name"', () => {
    setup({ label: undefined })
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })
})
