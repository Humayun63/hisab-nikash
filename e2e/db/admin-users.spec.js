// API tests for the admin-users Edge Function (SPEC.md §5.3, §8). No browser: calls the deployed
// function through supabase-js. Uses Org D only; other orgs' super admins act as outsiders (read-only).
import { test, expect } from '@playwright/test'
import { anonClient, signIn, runSql } from '../support/db.js'
import { USERS, ORG_D, SPACES, TEST_PASSWORD } from '../fixtures/ids.js'

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const email = (tag) => `fnapi-${tag}-${RUN}@e2e.hisab-nikash.test`
const PASSWORD = 'Valid-Pass-123'
const OTHER_ORG_SPACE = SPACES.office
const created = []

async function call(client, payload) {
  const { data, error } = await client.functions.invoke('admin-users', { body: payload })
  if (error) {
    const res = error.context
    if (res && typeof res.json === 'function') {
      let body = null
      try { body = await res.json() } catch { /* not JSON */ }
      return { status: res.status, body }
    }
    throw error
  }
  return { status: 200, body: data }
}

function validCreate(tag, extra = {}) {
  return { action: 'create', first_name: 'Api', last_name: 'Tester', email: email(tag), password: PASSWORD, ...extra }
}

async function createOk(sa, tag, extra) {
  const payload = validCreate(tag, extra)
  const res = await call(sa, payload)
  expect([200, 201]).toContain(res.status)
  created.push(res.body.user.id)
  return { res, payload }
}

function authUserCount(addr) {
  const out = runSql({ sql: `select count(*) as n from auth.users where email = '${addr}'` })
  const m = out.match(/"n":\s*"?(\d+)"?/)
  if (!m) throw new Error(`Unexpected SQL output: ${out}`)
  return Number(m[1])
}

let sa
let profileOf
test.beforeAll(async () => {
  sa = await signIn(ORG_D.superAdmin.email)
  profileOf = async (id) => (await sa.from('profiles').select('*').eq('id', id).maybeSingle()).data
})

test.afterAll(async () => {
  for (const id of created) await call(sa, { action: 'delete', user_id: id })
})

test.describe('auth', () => {
  test('no Authorization header -> 401', async () => {
    const res = await call(anonClient(), { action: 'delete', user_id: ORG_D.target.id })
    // supabase-js sends the anon key as bearer, which is not a user token
    expect(res.status).toBe(401)
    const raw = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', user_id: ORG_D.target.id }),
    })
    expect(raw.status).toBe(401)
  })

  test('non-super-admin gets 403 for every action', async () => {
    const viewer = await signIn(ORG_D.viewer.email)
    for (const action of ['create', 'update', 'delete', 'resend_invitation']) {
      const res = await call(viewer, { ...validCreate('nope'), action, user_id: ORG_D.target.id })
      expect(res.status, action).toBe(403)
      expect(res.body.code).toBe('forbidden')
    }
    expect(authUserCount(email('nope'))).toBe(0)
  })

  test('super admin of another org gets 404 for Org D users', async () => {
    for (const caller of [USERS.superAdmin, USERS.otherSuperAdmin]) {
      const other = await signIn(caller.email)
      for (const payload of [
        { action: 'update', user_id: ORG_D.target.id, first_name: 'Hacked' },
        { action: 'delete', user_id: ORG_D.target.id },
        { action: 'resend_invitation', user_id: ORG_D.target.id },
      ]) {
        const res = await call(other, payload)
        expect(res.status, payload.action).toBe(404)
        expect(res.body.error).toBe('User not found')
      }
    }
    expect((await profileOf(ORG_D.target.id)).first_name).not.toBe('Hacked')
  })

  test('unknown action and invalid JSON -> 400', async () => {
    const res = await call(sa, { action: 'explode' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('bad_request')
    const { data: { session } } = await sa.auth.getSession()
    const raw = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: process.env.VITE_SUPABASE_ANON_KEY },
      body: '{not json',
    })
    expect(raw.status).toBe(400)
    expect((await raw.json()).code).toBe('bad_request')
  })
})

test.describe('create', () => {
  test('validation errors -> 400', async () => {
    const cases = {
      'missing first name': { first_name: '' },
      'missing last name': { last_name: '  ' },
      'bad email': { email: 'not-an-email' },
      'short password': { password: 'a1' },
      'password without number': { password: 'onlyletters' },
      'password without letter': { password: '12345678' },
      'bad role': { memberships: [{ space_id: ORG_D.space.id, role: 'owner' }] },
      'duplicate space': { memberships: [{ space_id: ORG_D.space.id, role: 'viewer' }, { space_id: ORG_D.space.id, role: 'editor' }] },
    }
    for (const [name, extra] of Object.entries(cases)) {
      const res = await call(sa, validCreate('val', extra))
      expect(res.status, name).toBe(400)
      expect(res.body.code, name).toBe('validation_failed')
    }
    expect(authUserCount(email('val'))).toBe(0)
  })

  test('space from another org -> 400 invalid_space and no orphan auth user', async () => {
    const payload = validCreate('orphan', { memberships: [{ space_id: OTHER_ORG_SPACE, role: 'viewer' }] })
    const res = await call(sa, payload)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('invalid_space')
    expect(authUserCount(payload.email)).toBe(0)
  })

  test('success: invited user, memberships, sign-in, duplicate email', async () => {
    const { res, payload } = await createOk(sa, 'main', {
      email: `  FnApi-MAIN-${RUN}@E2E.Hisab-Nikash.TEST `,
      memberships: [{ space_id: ORG_D.space.id, role: 'editor' }],
    })
    const user = res.body.user
    expect(user.status).toBe('invited')
    expect(user.must_change_password).toBe(true)
    expect(user.org_id).toBe(ORG_D.id)
    expect(user.email).toBe(`fnapi-main-${RUN}@e2e.hisab-nikash.test`)
    expect(typeof res.body.invitation.sent).toBe('boolean')

    const { data: members } = await sa.from('space_members').select('space_id, role').eq('user_id', user.id)
    expect(members).toEqual([{ space_id: ORG_D.space.id, role: 'editor' }])

    const c = anonClient()
    const { error } = await c.auth.signInWithPassword({ email: user.email, password: PASSWORD })
    expect(error).toBeNull()

    const dup = await call(sa, { ...payload, email: user.email })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('email_exists')
  })

  test('must_change_password=false is honoured', async () => {
    const { res } = await createOk(sa, 'nochange', { must_change_password: false })
    expect(res.body.user.must_change_password).toBe(false)
    expect((await profileOf(res.body.user.id)).must_change_password).toBe(false)
  })
})

test.describe('update', () => {
  test.describe.configure({ mode: 'serial' })
  const T = ORG_D.target
  let currentEmail = T.email
  let currentPassword = TEST_PASSWORD
  const signInAs = (addr, pw) => anonClient().auth.signInWithPassword({ email: addr, password: pw })

  test('rename', async () => {
    const res = await call(sa, { action: 'update', user_id: T.id, first_name: 'Renamed', last_name: 'Person' })
    expect(res.status).toBe(200)
    const p = await profileOf(T.id)
    expect([p.first_name, p.last_name]).toEqual(['Renamed', 'Person'])
  })

  test('change email', async () => {
    const next = email('newaddr')
    const res = await call(sa, { action: 'update', user_id: T.id, email: next.toUpperCase().replace('@', '@') })
    expect(res.status).toBe(200)
    currentEmail = next
    expect((await profileOf(T.id)).email).toBe(next)
    expect((await signInAs(next, currentPassword)).error).toBeNull()
  })

  test('set password + must_change_password true', async () => {
    const res = await call(sa, { action: 'update', user_id: T.id, password: 'Brand-New-Pass-9', must_change_password: true })
    expect(res.status).toBe(200)
    expect(res.body.user.must_change_password).toBe(true)
    currentPassword = 'Brand-New-Pass-9'
    expect((await signInAs(currentEmail, currentPassword)).error).toBeNull()
    expect((await signInAs(currentEmail, TEST_PASSWORD)).error).not.toBeNull()
    expect((await profileOf(T.id)).must_change_password).toBe(true)
  })

  test('password change alone clears must_change_password (trigger)', async () => {
    const res = await call(sa, { action: 'update', user_id: T.id, password: 'Another-Pass-77' })
    expect(res.status).toBe(200)
    currentPassword = 'Another-Pass-77'
    expect(res.body.user.must_change_password).toBe(false)
  })

  test('weak password -> 400', async () => {
    const res = await call(sa, { action: 'update', user_id: T.id, password: 'short' })
    expect(res.status).toBe(400)
  })

  test('disable blocks sign-in, enable restores it', async () => {
    let res = await call(sa, { action: 'update', user_id: T.id, status: 'disabled' })
    expect(res.status).toBe(200)
    expect((await profileOf(T.id)).status).toBe('disabled')
    const banned = await signInAs(currentEmail, currentPassword)
    expect(banned.error?.code).toBe('user_banned')

    res = await call(sa, { action: 'update', user_id: T.id, status: 'active' })
    expect(res.status).toBe(200)
    expect((await profileOf(T.id)).status).toBe('active')
    expect((await signInAs(currentEmail, currentPassword)).error).toBeNull()
  })

  test('is_super_admin and org_id are ignored', async () => {
    const before = await profileOf(T.id)
    const res = await call(sa, { action: 'update', user_id: T.id, is_super_admin: true, org_id: 'a1000000-0000-4000-8000-000000000001' })
    expect(res.status).toBe(200)
    const after = await profileOf(T.id)
    expect(after.is_super_admin).toBe(false)
    expect(after.org_id).toBe(ORG_D.id)
    expect(after.first_name).toBe(before.first_name)
    // also via a combined update
    await call(sa, { action: 'update', user_id: T.id, last_name: 'Combo', is_super_admin: true, org_id: 'a1000000-0000-4000-8000-000000000001' })
    const final = await profileOf(T.id)
    expect(final.last_name).toBe('Combo')
    expect(final.is_super_admin).toBe(false)
    expect(final.org_id).toBe(ORG_D.id)
  })
})

test.describe('self-protection', () => {
  test('cannot disable or delete self; can rename self', async () => {
    const id = ORG_D.superAdmin.id
    for (const payload of [{ action: 'update', user_id: id, status: 'disabled' }, { action: 'delete', user_id: id }]) {
      const res = await call(sa, payload)
      expect(res.status, payload.action).toBe(400)
      expect(res.body.code).toBe('self_action')
    }
    expect((await profileOf(id)).status).toBe('active')
    const res = await call(sa, { action: 'update', user_id: id, first_name: 'Fern' })
    expect(res.status).toBe(200)
  })
})

test.describe('delete', () => {
  test('deletes the user, keeps their entries with created_by null', async () => {
    const D = ORG_D.deletable
    const res = await call(sa, { action: 'delete', user_id: D.id })
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
    expect(await profileOf(D.id)).toBeNull()
    const { error } = await anonClient().auth.signInWithPassword({ email: D.email, password: TEST_PASSWORD })
    expect(error).not.toBeNull()
    const { data } = await sa.from('entries').select('note, created_by').eq('note', 'by dell')
    expect(data).toEqual([{ note: 'by dell', created_by: null }])
    const again = await call(sa, { action: 'delete', user_id: D.id })
    expect(again.status).toBe(404)
  })
})

test.describe('resend_invitation', () => {
  test('invited user -> 200 with invitation shape; disabled -> 400', async () => {
    const { res } = await createOk(sa, 'resend')
    const id = res.body.user.id
    const ok = await call(sa, { action: 'resend_invitation', user_id: id })
    expect(ok.status).toBe(200)
    expect(typeof ok.body.invitation.sent).toBe('boolean')
    if (!ok.body.invitation.sent) expect(typeof ok.body.invitation.error).toBe('string')

    expect((await call(sa, { action: 'update', user_id: id, status: 'disabled' })).status).toBe(200)
    const bad = await call(sa, { action: 'resend_invitation', user_id: id })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('user_disabled')
  })
})

test.describe('update memberships (review fix: one request for everything)', () => {
  test('replaces the space access list and rejects other orgs\' spaces', async () => {
    const { res } = await createOk(sa, 'members', { memberships: [{ space_id: ORG_D.space.id, role: 'viewer' }] })
    const id = res.body.user.id
    const rolesOf = async () => (await sa.from('space_members').select('space_id, role').eq('user_id', id)).data

    const promote = await call(sa, { action: 'update', user_id: id, memberships: [{ space_id: ORG_D.space.id, role: 'admin' }] })
    expect(promote.status).toBe(200)
    expect(await rolesOf()).toEqual([{ space_id: ORG_D.space.id, role: 'admin' }])

    const foreign = await call(sa, { action: 'update', user_id: id, memberships: [{ space_id: OTHER_ORG_SPACE, role: 'viewer' }] })
    expect(foreign.status).toBe(400)
    expect(foreign.body.code).toBe('invalid_space')
    expect(await rolesOf()).toEqual([{ space_id: ORG_D.space.id, role: 'admin' }])

    const removeAll = await call(sa, { action: 'update', user_id: id, memberships: [] })
    expect(removeAll.status).toBe(200)
    expect(await rolesOf()).toEqual([])
  })

  test('the super admin cannot be given space memberships', async () => {
    const res = await call(sa, { action: 'update', user_id: ORG_D.superAdmin.id, memberships: [{ space_id: ORG_D.space.id, role: 'viewer' }] })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('invalid_membership')
  })
})
