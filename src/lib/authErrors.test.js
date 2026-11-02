import { describe, expect, it } from 'vitest'
import { GENERIC_ERROR, authErrorMessage, readUrlAuthError } from './authErrors'

describe('authErrorMessage', () => {
  it('returns null for no error', () => {
    expect(authErrorMessage(null)).toBeNull()
    expect(authErrorMessage(undefined)).toBeNull()
  })
  it.each([
    ['invalid_credentials', /Incorrect email or password/],
    ['email_not_confirmed', /verify your email/],
    ['user_already_exists', /already exists/],
    ['email_exists', /already exists/],
    ['weak_password', /at least 8 characters/],
    ['same_password', /different from your current password/],
    ['over_email_send_rate_limit', /Too many emails/],
    ['otp_expired', /expired/],
  ])('maps code %s', (code, re) => {
    expect(authErrorMessage({ code, message: 'raw' })).toMatch(re)
  })
  it('prefers code mapping over raw message', () => {
    expect(authErrorMessage({ code: 'signup_disabled', message: 'raw' })).toBe('Registration is currently disabled.')
  })
  it('detects network errors', () => {
    const msg = 'Could not reach the server. Check your connection and try again.'
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(msg)
    expect(authErrorMessage({ message: 'Failed to fetch' })).toBe(msg)
  })
  it('falls back to the raw message for unknown codes', () => {
    expect(authErrorMessage({ code: 'weird', message: 'Boom' })).toBe('Boom')
  })
  it('uses the generic message when nothing is available', () => {
    expect(authErrorMessage({})).toBe(GENERIC_ERROR)
  })
})

describe('readUrlAuthError', () => {
  const loc = (hash = '', search = '') => ({ hash, search })

  it('returns null when no error present', () => {
    expect(readUrlAuthError(loc())).toBeNull()
    expect(readUrlAuthError(loc('#access_token=abc', '?foo=1'))).toBeNull()
  })
  it('maps a known error_code from the hash', () => {
    expect(readUrlAuthError(loc('#error=access_denied&error_code=otp_expired&error_description=x'))).toMatch(/expired/)
  })
  it('reads from the query string', () => {
    expect(readUrlAuthError(loc('', '?error_code=otp_expired'))).toMatch(/expired/)
    expect(readUrlAuthError(loc('', '?error_description=Bad+thing'))).toBe('Bad thing')
  })
  it('decodes + in unknown descriptions', () => {
    expect(readUrlAuthError(loc('#error_code=unknown_x&error_description=Email+link+is+invalid'))).toBe(
      'Email link is invalid',
    )
  })
  it('falls back to generic when code is unknown and no description', () => {
    expect(readUrlAuthError(loc('#error_code=unknown_x'))).toBe(GENERIC_ERROR)
  })
  it('defaults to window.location', () => {
    window.history.replaceState(null, '', '/auth/callback#error_code=otp_expired')
    expect(readUrlAuthError()).toMatch(/expired/)
    window.history.replaceState(null, '', '/')
  })
})

describe('disabled accounts', () => {
  it('maps a banned user to the disabled message', async () => {
    const { authErrorMessage, DISABLED_MESSAGE } = await import('./authErrors')
    expect(authErrorMessage({ code: 'user_banned', message: 'User is banned' })).toBe(DISABLED_MESSAGE)
  })
})
