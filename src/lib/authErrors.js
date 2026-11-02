// Turns Supabase Auth / PostgREST errors into messages for the user.
export const DISABLED_MESSAGE = 'Your account has been disabled. Contact your administrator.'

const MESSAGES = {
  user_banned: DISABLED_MESSAGE, // disabling a user also bans them in Supabase Auth
  invalid_credentials: 'Incorrect email or password. If you just registered, verify your email first.',
  email_not_confirmed: 'Please verify your email before signing in.',
  user_already_exists: 'An account with this email already exists.',
  email_exists: 'An account with this email already exists.',
  weak_password: 'Password must be at least 8 characters and contain a letter and a number.',
  same_password: 'Your new password must be different from your current password.',
  email_address_invalid: 'This email address cannot be used. Please use a different one.',
  over_email_send_rate_limit: 'Too many emails sent. Please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  signup_disabled: 'Registration is currently disabled.',
  session_not_found: 'Your session has expired. Please sign in again.',
  otp_expired: 'This link has expired. Please request a new one.',
}

export const GENERIC_ERROR = 'Something went wrong. Please try again.'

export function authErrorMessage(error) {
  if (!error) return null
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]
  if (error.name === 'AuthRetryableFetchError' || error.message === 'Failed to fetch') {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return error.message || GENERIC_ERROR
}

// Errors Supabase puts in the URL of an email link, e.g. #error=access_denied&error_code=otp_expired
export function readUrlAuthError(location = window.location) {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(location.search)
  const code = params.get('error_code') || query.get('error_code')
  const description = params.get('error_description') || query.get('error_description')
  if (!code && !description) return null
  return MESSAGES[code] || description?.replace(/\+/g, ' ') || GENERIC_ERROR
}
