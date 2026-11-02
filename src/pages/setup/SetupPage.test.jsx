import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('../../auth/AuthProvider', () => ({ useAuth: vi.fn() }))
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../auth/AuthProvider'
import SetupPage from './SetupPage'

const refreshProfile = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  refreshProfile.mockResolvedValue()
  useAuth.mockReturnValue({
    user: { user_metadata: { first_name: 'Ada' } },
    refreshProfile,
    signOut: vi.fn(),
  })
})

function setup() {
  render(
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<div>HOME MARKER</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('SetupPage', () => {
  it('prefills defaults', () => {
    setup()
    expect(screen.getByLabelText('Organization name')).toHaveValue("Ada's Organization")
    expect(screen.getByLabelText('Week starts on')).toHaveValue('6')
    expect(screen.getByRole('option', { name: 'Saturday' }).selected).toBe(true)
    expect(screen.getByLabelText('Currency')).toHaveValue('BDT')
    expect(screen.getByLabelText('Space name')).toHaveValue('General')
    expect(screen.getByLabelText('Timezone').value).toBeTruthy()
  })

  it('falls back to "My Organization" without a first name', () => {
    useAuth.mockReturnValue({ user: { user_metadata: {} }, refreshProfile, signOut: vi.fn() })
    setup()
    expect(screen.getByLabelText('Organization name')).toHaveValue('My Organization')
  })

  it('submits setup_organization with symbol and numeric week start', async () => {
    supabase.rpc.mockResolvedValue({ error: null })
    const user = setup()
    await user.selectOptions(screen.getByLabelText('Timezone'), 'Asia/Dhaka')
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByText('HOME MARKER')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('setup_organization', {
      p_org_name: "Ada's Organization",
      p_timezone: 'Asia/Dhaka',
      p_space_name: 'General',
      p_currency_code: 'BDT',
      p_currency_symbol: '৳',
      p_week_start: 6,
    })
    expect(refreshProfile).toHaveBeenCalled()
  })

  it('sends changed values (currency symbol follows selection)', async () => {
    supabase.rpc.mockResolvedValue({ error: null })
    const user = setup()
    await user.selectOptions(screen.getByLabelText('Currency'), 'USD')
    await user.selectOptions(screen.getByLabelText('Week starts on'), 'Monday')
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    await screen.findByText('HOME MARKER')
    expect(supabase.rpc.mock.calls[0][1]).toMatchObject({ p_currency_code: 'USD', p_currency_symbol: '$', p_week_start: 1 })
  })

  it('validates required names without calling rpc', async () => {
    const user = setup()
    await user.clear(screen.getByLabelText('Organization name'))
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByText('Organization name is required')).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('shows rpc errors and does not navigate', async () => {
    supabase.rpc.mockResolvedValue({ error: { message: 'Organization already exists' } })
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Create organization' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Organization already exists')
    expect(screen.queryByText('HOME MARKER')).not.toBeInTheDocument()
    expect(refreshProfile).not.toHaveBeenCalled()
  })
})
