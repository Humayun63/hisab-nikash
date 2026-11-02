// Pure validation and permission rules for the admin-users Edge Function.
// No Deno or Supabase imports, so the same code is unit tested with Vitest.

export const ROLES = ['viewer', 'editor', 'admin']
export const ACTIONS = ['create', 'update', 'delete', 'resend_invitation']
// Supabase Auth has no "disabled" flag; a very long ban is the documented way to block sign-in.
export const DISABLED_BAN_DURATION = '876000h' // ~100 years
export const ENABLED_BAN_DURATION = 'none'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function passwordProblem(password) {
  if (typeof password !== 'string') return 'Password is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (password.length > 72) return 'Password must be 72 characters or fewer'
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter'
  if (!/\d/.test(password)) return 'Password must contain a number'
  return null
}

function cleanName(value, label, errors) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) errors.push(`${label} is required`)
  else if (name.length > 50) errors.push(`${label} must be 50 characters or fewer`)
  return name
}

function cleanEmail(value, errors) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email)) errors.push('Enter a valid email address')
  return email
}

function cleanMemberships(value, errors) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    errors.push('Memberships must be a list')
    return []
  }
  const seen = new Set()
  const result = []
  for (const m of value) {
    if (!m || !UUID_RE.test(m.space_id ?? '') || !ROLES.includes(m.role)) {
      errors.push('Each membership needs a space and a role (viewer, editor or admin)')
      continue
    }
    if (seen.has(m.space_id)) {
      errors.push('A user can only have one role per space')
      continue
    }
    seen.add(m.space_id)
    result.push({ space_id: m.space_id, role: m.role })
  }
  return result
}

function fail(errors) {
  if (errors.length) throw new HttpError(400, errors.join('. '), 'validation_failed')
}

export function parseCreate(body) {
  const errors = []
  const value = {
    first_name: cleanName(body?.first_name, 'First name', errors),
    last_name: cleanName(body?.last_name, 'Last name', errors),
    email: cleanEmail(body?.email, errors),
    password: body?.password,
    must_change_password: body?.must_change_password !== false, // default: force a change
    memberships: cleanMemberships(body?.memberships, errors),
  }
  const pw = passwordProblem(value.password)
  if (pw) errors.push(pw)
  fail(errors)
  return value
}

// Every field is optional; only the ones present are changed.
export function parseUpdate(body) {
  const errors = []
  if (!UUID_RE.test(body?.user_id ?? '')) errors.push('user_id is required')
  const value = { user_id: body?.user_id }
  if (body?.first_name !== undefined) value.first_name = cleanName(body.first_name, 'First name', errors)
  if (body?.last_name !== undefined) value.last_name = cleanName(body.last_name, 'Last name', errors)
  if (body?.email !== undefined) value.email = cleanEmail(body.email, errors)
  if (body?.password !== undefined && body.password !== '') {
    const pw = passwordProblem(body.password)
    if (pw) errors.push(pw)
    value.password = body.password
  }
  if (body?.status !== undefined) {
    if (!['active', 'disabled'].includes(body.status)) errors.push('Status must be active or disabled')
    value.status = body.status
  }
  if (body?.must_change_password !== undefined) {
    if (typeof body.must_change_password !== 'boolean') errors.push('must_change_password must be true or false')
    value.must_change_password = body.must_change_password
  }
  // Full list of the user's space roles; spaces not listed lose access. Omit to leave unchanged.
  if (body?.memberships !== undefined && body.memberships !== null) {
    value.memberships = cleanMemberships(body.memberships, errors)
  }
  fail(errors)
  return value
}

export function parseTarget(body) {
  if (!UUID_RE.test(body?.user_id ?? '')) throw new HttpError(400, 'user_id is required', 'validation_failed')
  return { user_id: body.user_id }
}

// caller: the signed-in user's profile. Only an enabled super admin may manage users.
export function assertSuperAdmin(caller) {
  if (!caller || !caller.is_super_admin || caller.status === 'disabled') {
    throw new HttpError(403, 'Only the super admin can manage users', 'forbidden')
  }
}

// target: profile being managed. Must be in the caller's organization. The super admin
// cannot disable or delete themselves (they would lock everyone out).
export function assertCanManage(caller, target, { action, status } = {}) {
  if (!target || target.org_id !== caller.org_id) {
    throw new HttpError(404, 'User not found', 'not_found')
  }
  const self = target.id === caller.id
  if (self && action === 'delete') throw new HttpError(400, 'You cannot delete your own account', 'self_action')
  if (self && status === 'disabled') throw new HttpError(400, 'You cannot disable your own account', 'self_action')
}

// Profile status after enabling/disabling: re-enabled users go back to "invited" if they
// never signed in.
export function nextStatus(target, requested) {
  if (requested === 'disabled') return 'disabled'
  if (requested === 'active') return target.accepted_at ? 'active' : 'invited'
  return target.status
}

export function assertSpacesInOrg(memberships, orgSpaceIds) {
  const allowed = new Set(orgSpaceIds)
  if (memberships.some((m) => !allowed.has(m.space_id))) {
    throw new HttpError(400, 'One of the spaces does not belong to your organization', 'invalid_space')
  }
}

// Invitation links may only point at the app itself: the request's Origin when it is one of
// the allowed app URLs, otherwise the configured APP_URL.
export function invitationOrigin(requestOrigin, allowedOrigins, appUrl) {
  return requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : appUrl
}

export function parseAllowedOrigins(value, appUrl) {
  const list = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return [...new Set([appUrl, ...list])]
}

// Supabase Auth admin errors → user-facing messages.
export function authAdminError(error) {
  const code = error?.code
  if (code === 'email_exists' || code === 'user_already_exists' || /already been registered/i.test(error?.message ?? '')) {
    return new HttpError(409, 'A user with this email already exists', 'email_exists')
  }
  if (code === 'weak_password') return new HttpError(400, error.message, 'weak_password')
  if (code === 'email_address_invalid' || code === 'validation_failed') {
    return new HttpError(400, error.message || 'Invalid email address', code)
  }
  return new HttpError(500, error?.message || 'Auth error', code ?? 'auth_error')
}
