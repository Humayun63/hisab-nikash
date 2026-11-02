import { describe, expect, it } from 'vitest'
import {
  HttpError,
  assertCanManage,
  assertSpacesInOrg,
  assertSuperAdmin,
  authAdminError,
  nextStatus,
  parseCreate,
  parseTarget,
  parseUpdate,
  passwordProblem,
} from '../../supabase/functions/admin-users/logic.js'

const U1 = '11111111-1111-4111-8111-111111111111'
const S1 = '22222222-2222-4222-8222-222222222222'
const S2 = '33333333-3333-4333-8333-333333333333'

function thrown(fn) {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('expected function to throw')
}

describe('HttpError', () => {
  it('carries status, code and message', () => {
    const e = new HttpError(418, 'teapot', 'tea')
    expect(e).toBeInstanceOf(Error)
    expect([e.status, e.code, e.message]).toEqual([418, 'tea', 'teapot'])
  })
})

describe('passwordProblem', () => {
  it.each([
    [undefined, 'Password is required'],
    [123, 'Password is required'],
    ['abc1', 'at least 8'],
    ['a1'.repeat(37), '72 characters'],
    ['12345678', 'letter'],
    ['abcdefgh', 'number'],
  ])('rejects %s', (pw, text) => {
    expect(passwordProblem(pw)).toContain(text)
  })
  it('accepts a valid password, including boundaries', () => {
    expect(passwordProblem('abcdefg1')).toBeNull()
    expect(passwordProblem('a1' + 'x'.repeat(70))).toBeNull()
  })
})

describe('parseCreate', () => {
  const base = { first_name: 'Ann', last_name: 'Lee', email: 'ann@x.co', password: 'secret123' }

  it('trims names, lowercases email and defaults must_change_password to true', () => {
    const v = parseCreate({ ...base, first_name: '  Ann ', last_name: ' Lee  ', email: '  ANN@X.Co ' })
    expect(v).toMatchObject({ first_name: 'Ann', last_name: 'Lee', email: 'ann@x.co', must_change_password: true, memberships: [] })
  })
  it('honours explicit must_change_password false only', () => {
    expect(parseCreate({ ...base, must_change_password: false }).must_change_password).toBe(false)
    expect(parseCreate({ ...base, must_change_password: true }).must_change_password).toBe(true)
  })
  it('collects validation errors into a 400', () => {
    const e = thrown(() => parseCreate({ first_name: ' ', email: 'nope', password: 'x' }))
    expect(e).toBeInstanceOf(HttpError)
    expect(e.status).toBe(400)
    expect(e.code).toBe('validation_failed')
    expect(e.message).toMatch(/First name is required/)
    expect(e.message).toMatch(/Last name is required/)
    expect(e.message).toMatch(/valid email/)
    expect(e.message).toMatch(/at least 8/)
  })
  it('rejects a null body', () => {
    expect(thrown(() => parseCreate(null)).status).toBe(400)
  })
  it('rejects names over 50 characters', () => {
    expect(thrown(() => parseCreate({ ...base, first_name: 'a'.repeat(51) })).message).toMatch(/50 characters/)
  })
  it('accepts valid memberships', () => {
    const v = parseCreate({ ...base, memberships: [{ space_id: S1, role: 'editor' }, { space_id: S2, role: 'viewer', extra: 1 }] })
    expect(v.memberships).toEqual([
      { space_id: S1, role: 'editor' },
      { space_id: S2, role: 'viewer' },
    ])
  })
  it('rejects bad uuid, bad role, non-list and duplicate spaces', () => {
    expect(thrown(() => parseCreate({ ...base, memberships: [{ space_id: 'abc', role: 'viewer' }] })).message).toMatch(/space and a role/)
    expect(thrown(() => parseCreate({ ...base, memberships: [{ space_id: S1, role: 'owner' }] })).message).toMatch(/space and a role/)
    expect(thrown(() => parseCreate({ ...base, memberships: [null] })).status).toBe(400)
    expect(thrown(() => parseCreate({ ...base, memberships: 'x' })).message).toMatch(/must be a list/)
    expect(
      thrown(() => parseCreate({ ...base, memberships: [{ space_id: S1, role: 'viewer' }, { space_id: S1, role: 'admin' }] })).message,
    ).toMatch(/one role per space/)
  })
})

describe('parseUpdate', () => {
  it('returns only user_id when nothing else is provided', () => {
    expect(parseUpdate({ user_id: U1 })).toEqual({ user_id: U1 })
  })
  it('returns only provided fields, cleaned', () => {
    expect(parseUpdate({ user_id: U1, first_name: ' Bob ', email: 'B@X.CO' })).toEqual({
      user_id: U1,
      first_name: 'Bob',
      email: 'b@x.co',
    })
  })
  it('ignores an empty password but validates a non-empty one', () => {
    expect(parseUpdate({ user_id: U1, password: '' })).not.toHaveProperty('password')
    expect(parseUpdate({ user_id: U1, password: 'secret123' }).password).toBe('secret123')
    expect(thrown(() => parseUpdate({ user_id: U1, password: 'short' })).status).toBe(400)
  })
  it('validates status', () => {
    expect(parseUpdate({ user_id: U1, status: 'disabled' }).status).toBe('disabled')
    expect(thrown(() => parseUpdate({ user_id: U1, status: 'invited' })).message).toMatch(/active or disabled/)
  })
  it('requires boolean must_change_password', () => {
    expect(parseUpdate({ user_id: U1, must_change_password: false }).must_change_password).toBe(false)
    expect(thrown(() => parseUpdate({ user_id: U1, must_change_password: 'yes' })).message).toMatch(/true or false/)
  })
  it('requires a valid user_id', () => {
    expect(thrown(() => parseUpdate({ first_name: 'A' })).message).toMatch(/user_id is required/)
    expect(thrown(() => parseUpdate({ user_id: 'nope' })).status).toBe(400)
  })
})

describe('parseTarget', () => {
  it('returns the user id', () => expect(parseTarget({ user_id: U1, x: 1 })).toEqual({ user_id: U1 }))
  it('throws 400 for missing or malformed id', () => {
    for (const body of [undefined, {}, { user_id: 'x' }]) {
      const e = thrown(() => parseTarget(body))
      expect([e.status, e.code]).toEqual([400, 'validation_failed'])
    }
  })
})

describe('assertSuperAdmin', () => {
  it('allows an enabled super admin', () => {
    expect(() => assertSuperAdmin({ is_super_admin: true, status: 'active' })).not.toThrow()
  })
  it.each([
    ['null', null],
    ['non super admin', { is_super_admin: false, status: 'active' }],
    ['disabled super admin', { is_super_admin: true, status: 'disabled' }],
  ])('rejects %s with 403', (_, caller) => {
    const e = thrown(() => assertSuperAdmin(caller))
    expect([e.status, e.code]).toEqual([403, 'forbidden'])
  })
})

describe('assertCanManage', () => {
  const caller = { id: 'me', org_id: 'o1' }
  it('404 for another organization or missing target', () => {
    expect(thrown(() => assertCanManage(caller, { id: 'x', org_id: 'o2' })).status).toBe(404)
    expect(thrown(() => assertCanManage(caller, null)).code).toBe('not_found')
  })
  it('allows managing others', () => {
    expect(() => assertCanManage(caller, { id: 'x', org_id: 'o1' }, { action: 'delete' })).not.toThrow()
    expect(() => assertCanManage(caller, { id: 'x', org_id: 'o1' }, { status: 'disabled' })).not.toThrow()
  })
  it('blocks self delete and self disable with 400', () => {
    const self = { id: 'me', org_id: 'o1' }
    const del = thrown(() => assertCanManage(caller, self, { action: 'delete' }))
    expect([del.status, del.code]).toEqual([400, 'self_action'])
    expect(thrown(() => assertCanManage(caller, self, { status: 'disabled' })).status).toBe(400)
  })
  it('allows self update and self re-enable', () => {
    const self = { id: 'me', org_id: 'o1' }
    expect(() => assertCanManage(caller, self, { action: 'update' })).not.toThrow()
    expect(() => assertCanManage(caller, self, { action: 'update', status: 'active' })).not.toThrow()
    expect(() => assertCanManage(caller, self)).not.toThrow()
  })
})

describe('nextStatus', () => {
  it('disabled stays disabled', () => expect(nextStatus({ status: 'active' }, 'disabled')).toBe('disabled'))
  it('re-enabling depends on accepted_at', () => {
    expect(nextStatus({ accepted_at: '2026-01-01' }, 'active')).toBe('active')
    expect(nextStatus({ accepted_at: null }, 'active')).toBe('invited')
  })
  it('keeps the current status when nothing is requested', () => {
    expect(nextStatus({ status: 'invited' }, undefined)).toBe('invited')
  })
})

describe('assertSpacesInOrg', () => {
  it('passes when all spaces belong to the org (or none given)', () => {
    expect(() => assertSpacesInOrg([{ space_id: S1 }], [S1, S2])).not.toThrow()
    expect(() => assertSpacesInOrg([], [])).not.toThrow()
  })
  it('throws invalid_space otherwise', () => {
    const e = thrown(() => assertSpacesInOrg([{ space_id: S1 }, { space_id: S2 }], [S1]))
    expect([e.status, e.code]).toEqual([400, 'invalid_space'])
  })
})

describe('authAdminError', () => {
  it.each([
    [{ code: 'email_exists', message: 'x' }],
    [{ code: 'user_already_exists', message: 'x' }],
    [{ message: 'A user with this email address has already been registered' }],
  ])('maps duplicate email %# to 409', (err) => {
    const e = authAdminError(err)
    expect(e).toBeInstanceOf(HttpError)
    expect([e.status, e.code]).toEqual([409, 'email_exists'])
  })
  it('maps weak_password to 400 keeping the message', () => {
    const e = authAdminError({ code: 'weak_password', message: 'too weak' })
    expect([e.status, e.code, e.message]).toEqual([400, 'weak_password', 'too weak'])
  })
  it('maps invalid email to 400', () => {
    const e = authAdminError({ code: 'email_address_invalid', message: 'bad' })
    expect([e.status, e.code]).toEqual([400, 'email_address_invalid'])
  })
  it('maps unknown errors to 500', () => {
    const e = authAdminError({ code: 'boom', message: 'kaput' })
    expect([e.status, e.code, e.message]).toEqual([500, 'boom', 'kaput'])
    const f = authAdminError(undefined)
    expect([f.status, f.code, f.message]).toEqual([500, 'auth_error', 'Auth error'])
  })
})

describe('milestone 3 review fixes', () => {
  it('parseUpdate accepts a full memberships list and validates it', async () => {
    const { parseUpdate } = await import('../../supabase/functions/admin-users/logic.js')
    const id = '11111111-1111-4111-8111-111111111111'
    const space = '22222222-2222-4222-8222-222222222222'
    expect(parseUpdate({ user_id: id, memberships: [{ space_id: space, role: 'admin' }] }).memberships).toEqual([
      { space_id: space, role: 'admin' },
    ])
    expect(parseUpdate({ user_id: id, memberships: [] }).memberships).toEqual([])
    expect(parseUpdate({ user_id: id }).memberships).toBeUndefined()
    expect(() => parseUpdate({ user_id: id, memberships: [{ space_id: space, role: 'owner' }] })).toThrow(/role/)
  })

  it('invitation links only use allowed app origins', async () => {
    const { invitationOrigin, parseAllowedOrigins } = await import('../../supabase/functions/admin-users/logic.js')
    const allowed = parseAllowedOrigins('http://127.0.0.1:5173, https://app.example.com', 'http://localhost:5173')
    expect(allowed).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173', 'https://app.example.com'])
    expect(invitationOrigin('https://app.example.com', allowed, 'http://localhost:5173')).toBe('https://app.example.com')
    expect(invitationOrigin('https://evil.example', allowed, 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(invitationOrigin(null, allowed, 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(invitationOrigin('null', allowed, 'http://localhost:5173')).toBe('http://localhost:5173')
  })
})
