// Where a signed-in user belongs, based on their profile. Kept free of React so it can be unit tested.
//   no session            → /login
//   no profile            → /setup            (registered super admin who hasn't created an org)
//   disabled              → /account-disabled
//   must change password  → /change-password
//   otherwise             → null (may use the app)
export function requiredRoute({ session, profile }) {
  if (!session) return '/login'
  if (!profile) return '/setup'
  if (profile.status === 'disabled') return '/account-disabled'
  if (profile.must_change_password) return '/change-password'
  return null
}

// Only follow same-app paths after login, never external URLs.
export function safeRedirectPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return '/'
  return path
}
