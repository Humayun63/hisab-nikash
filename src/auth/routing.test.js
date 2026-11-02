import { describe, expect, it } from 'vitest'
import { requiredRoute, safeRedirectPath } from './routing'

const session = { user: { id: 'u1' } }

describe('requiredRoute', () => {
  it('sends signed-out visitors to login', () => {
    expect(requiredRoute({ session: null, profile: null })).toBe('/login')
  })

  it('sends users without a profile to setup', () => {
    expect(requiredRoute({ session, profile: null })).toBe('/setup')
  })

  it('sends disabled users to account-disabled', () => {
    expect(requiredRoute({ session, profile: { status: 'disabled', must_change_password: false } })).toBe('/account-disabled')
  })

  it('sends users who must change password to change-password', () => {
    expect(requiredRoute({ session, profile: { status: 'active', must_change_password: true } })).toBe('/change-password')
  })

  it('disabled takes precedence over must_change_password', () => {
    expect(requiredRoute({ session, profile: { status: 'disabled', must_change_password: true } })).toBe('/account-disabled')
  })

  it('no session wins even when a profile is present', () => {
    expect(requiredRoute({ session: null, profile: { status: 'active' } })).toBe('/login')
  })

  it('lets active users with a current password into the app', () => {
    expect(requiredRoute({ session, profile: { status: 'active', must_change_password: false } })).toBeNull()
  })
})

describe('safeRedirectPath', () => {
  it('rejects external URLs', () => {
    expect(safeRedirectPath('https://evil.example')).toBe('/')
    expect(safeRedirectPath('//evil.example')).toBe('/')
  })

  it.each([undefined, null, 42, {}, ['/x']])('rejects non-string %j', (v) => {
    expect(safeRedirectPath(v)).toBe('/')
  })

  it('rejects relative paths and empty string', () => {
    expect(safeRedirectPath('dashboard')).toBe('/')
    expect(safeRedirectPath('')).toBe('/')
    expect(safeRedirectPath('./x')).toBe('/')
  })

  it('keeps same-app paths including query strings', () => {
    expect(safeRedirectPath('/')).toBe('/')
    expect(safeRedirectPath('/x?y=1')).toBe('/x?y=1')
    expect(safeRedirectPath('/settings/users')).toBe('/settings/users')
  })
})
