import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SelectField, TextField } from './Field'
import Button from './Button'
import Alert from './Alert'

describe('TextField', () => {
  it('associates label with input', () => {
    render(<TextField label="Email" />)
    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement)
  })
  it('marks invalid and describes by both the error and the hint', () => {
    render(<TextField label="Email" error="Bad email" hint="A hint" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Bad email A hint')
    expect(screen.getByText('A hint')).toBeInTheDocument()
  })
  it('describes by the hint when there is no error', () => {
    render(<TextField label="Password" hint="A hint" />)
    const input = screen.getByLabelText('Password')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAccessibleDescription('A hint')
  })
  it('has no description without error or hint, and passes type', () => {
    render(<TextField label="Pw" type="password" />)
    const input = screen.getByLabelText('Pw')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(input).toHaveAttribute('type', 'password')
  })
})

describe('SelectField', () => {
  it('labels the select and shows error', () => {
    render(
      <SelectField label="Currency" error="Choose a currency">
        <option value="A">A</option>
      </SelectField>,
    )
    const select = screen.getByLabelText('Currency')
    expect(select.tagName).toBe('SELECT')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Choose a currency')
  })
})

describe('Button', () => {
  it('defaults to type=button and can be overridden', () => {
    const { rerender } = render(<Button>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button')
    rerender(<Button type="submit">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'submit')
  })
  it('is enabled with no spinner by default', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button')).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('disables and shows a spinner when loading', () => {
    render(<Button loading>Go</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
  it('respects disabled', () => {
    render(<Button disabled>Go</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

describe('Alert', () => {
  it.each([null, undefined, '', false])('renders nothing for %j', (children) => {
    const { container } = render(<Alert>{children}</Alert>)
    expect(container).toBeEmptyDOMElement()
  })
  it('uses role=alert for errors (default)', () => {
    render(<Alert>Oops</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('Oops')
  })
  it.each(['info', 'success'])('uses role=status for %s', (tone) => {
    render(<Alert tone={tone}>Fine</Alert>)
    expect(screen.getByRole('status')).toHaveTextContent('Fine')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
