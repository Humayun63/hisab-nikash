// admin-users Edge Function: user management for the super admin (SPEC.md §5.3, §8).
// POST { action: 'create' | 'update' | 'delete' | 'resend_invitation', ...payload }
// with the caller's access token in the Authorization header.
//
// Deployed with verify_jwt = false (supabase/config.toml): the caller is verified here with
// auth.getUser(), which also works with Supabase's asymmetric JWT signing keys.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  ACTIONS,
  DISABLED_BAN_DURATION,
  ENABLED_BAN_DURATION,
  HttpError,
  assertCanManage,
  assertSpacesInOrg,
  assertSuperAdmin,
  authAdminError,
  invitationOrigin,
  nextStatus,
  parseAllowedOrigins,
  parseCreate,
  parseTarget,
  parseUpdate,
} from './logic.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
// Invitation links point at the app: the request's Origin if it is allowed, else APP_URL.
// Set APP_URL / ALLOWED_ORIGINS (comma-separated) as function secrets for production.
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS') ?? 'http://127.0.0.1:5173', APP_URL)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(SUPABASE_URL, SERVICE_KEY, clientOptions)

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function getCaller(req) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Not signed in', 'unauthorized')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Not signed in', 'unauthorized')
  const { data: profile } = await admin.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
  assertSuperAdmin(profile)
  return profile
}

async function getTarget(userId) {
  const { data, error } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  return data
}

// Shown in the invitation email (supabase/templates/invitation.html reads the user's metadata).
async function invitationMetadata(caller) {
  const { data: org } = await admin.from('organizations').select('name').eq('id', caller.org_id).single()
  return { org_name: org?.name ?? '', invited_by: `${caller.first_name} ${caller.last_name}` }
}

// Sends the invitation as a Supabase "magic link" email that signs the user in and lands on
// /auth/callback. The account already exists and works with the password the super admin set,
// so a failed email is reported but does not fail the request.
async function sendInvitation(email, origin) {
  const mailer = createClient(SUPABASE_URL, ANON_KEY, clientOptions)
  const { error } = await mailer.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
  })
  return error ? { sent: false, error: error.message } : { sent: true }
}

async function createUser(caller, body, origin) {
  const input = parseCreate(body)

  const { data: spaces, error: spacesError } = await admin.from('spaces').select('id').eq('org_id', caller.org_id)
  if (spacesError) throw new HttpError(500, spacesError.message)
  assertSpacesInOrg(input.memberships, spaces.map((s) => s.id))

  const { data: created, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true, // the account works right away, even before the invitation is accepted
    user_metadata: { first_name: input.first_name, last_name: input.last_name, ...(await invitationMetadata(caller)) },
  })
  if (error) throw authAdminError(error)
  const userId = created.user.id

  // Never leave an auth user without a profile: it could otherwise run setup_organization().
  try {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .insert({
        id: userId,
        org_id: caller.org_id,
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        status: 'invited',
        must_change_password: input.must_change_password,
        invited_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (profileError) throw profileError

    if (input.memberships.length) {
      const { error: memberError } = await admin
        .from('space_members')
        .insert(input.memberships.map((m) => ({ ...m, user_id: userId })))
      if (memberError) throw memberError
    }

    const invitation = await sendInvitation(input.email, origin)
    return json(201, { user: profile, invitation })
  } catch (err) {
    console.error('create user failed after auth user was created', userId, err)
    const { error: rollbackError } = await admin.auth.admin.deleteUser(userId)
    if (rollbackError) console.error('ROLLBACK FAILED: orphan auth user', userId, rollbackError)
    throw new HttpError(500, 'Could not create the user. Please try again.', 'create_failed')
  }
}

async function updateUser(caller, body) {
  const input = parseUpdate(body)
  const target = await getTarget(input.user_id)
  assertCanManage(caller, target, { action: 'update', status: input.status })
  if (input.memberships) {
    if (target.is_super_admin) throw new HttpError(400, 'The super admin already has access to every space', 'invalid_membership')
    const { data: spaces, error: spacesError } = await admin.from('spaces').select('id').eq('org_id', caller.org_id)
    if (spacesError) throw new HttpError(500, spacesError.message)
    assertSpacesInOrg(input.memberships, spaces.map((s) => s.id))
  }

  // Disabling: mark the profile first, so RLS cuts access even if the Auth ban below fails.
  if (input.status === 'disabled' && target.status !== 'disabled') {
    const { error } = await admin.from('profiles').update({ status: 'disabled' }).eq('id', target.id)
    if (error) throw new HttpError(500, error.message)
  }

  const authChanges = {}
  if (input.email !== undefined && input.email !== target.email) {
    authChanges.email = input.email
    authChanges.email_confirm = true
  }
  if (input.password !== undefined) authChanges.password = input.password
  if (input.status === 'disabled') authChanges.ban_duration = DISABLED_BAN_DURATION
  if (input.status === 'active') authChanges.ban_duration = ENABLED_BAN_DURATION
  if (input.first_name !== undefined || input.last_name !== undefined) {
    authChanges.user_metadata = {
      first_name: input.first_name ?? target.first_name,
      last_name: input.last_name ?? target.last_name,
    }
  }

  if (Object.keys(authChanges).length) {
    const { error } = await admin.auth.admin.updateUserById(target.id, authChanges)
    if (error) throw authAdminError(error)
  }

  // Applied after the auth update: changing the password clears must_change_password via a
  // database trigger, so an explicit value here must come last.
  const patch = {}
  if (input.first_name !== undefined) patch.first_name = input.first_name
  if (input.last_name !== undefined) patch.last_name = input.last_name
  if (input.email !== undefined) patch.email = input.email
  // Enabling happens here, after the Auth ban was lifted above.
  if (input.status === 'active') patch.status = nextStatus(target, input.status)
  if (input.must_change_password !== undefined) patch.must_change_password = input.must_change_password

  if (Object.keys(patch).length) {
    const { error } = await admin.from('profiles').update(patch).eq('id', target.id)
    if (error) throw new HttpError(500, error.message)
  }

  if (input.memberships) {
    const keep = input.memberships.map((m) => m.space_id)
    let removal = admin.from('space_members').delete().eq('user_id', target.id)
    if (keep.length) removal = removal.not('space_id', 'in', `(${keep.join(',')})`)
    const { error: removeError } = await removal
    if (removeError) throw new HttpError(500, removeError.message)
    if (input.memberships.length) {
      const { error: upsertError } = await admin
        .from('space_members')
        .upsert(input.memberships.map((m) => ({ ...m, user_id: target.id })), { onConflict: 'space_id,user_id' })
      if (upsertError) throw new HttpError(500, upsertError.message)
    }
  }

  return json(200, { user: await getTarget(target.id) })
}

async function deleteUser(caller, body) {
  const { user_id } = parseTarget(body)
  const target = await getTarget(user_id)
  assertCanManage(caller, target, { action: 'delete' })
  // Cascades to the profile and memberships; their entries stay with created_by = null.
  const { error } = await admin.auth.admin.deleteUser(target.id)
  if (error) throw authAdminError(error)
  return json(200, { deleted: true })
}

async function resendInvitation(caller, body, origin) {
  const { user_id } = parseTarget(body)
  const target = await getTarget(user_id)
  assertCanManage(caller, target, { action: 'resend_invitation' })
  if (target.status === 'disabled') throw new HttpError(400, 'Enable the user before sending an invitation', 'user_disabled')

  // Refresh the organization / inviter names shown in the email.
  await admin.auth.admin.updateUserById(target.id, {
    user_metadata: { first_name: target.first_name, last_name: target.last_name, ...(await invitationMetadata(caller)) },
  })
  const invitation = await sendInvitation(target.email, origin)
  if (invitation.sent) {
    await admin.from('profiles').update({ invited_at: new Date().toISOString() }).eq('id', target.id)
  }
  return json(200, { invitation })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    let body
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, 'Invalid JSON body', 'bad_request')
    }
    if (!ACTIONS.includes(body?.action)) throw new HttpError(400, 'Unknown action', 'bad_request')

    const caller = await getCaller(req)
    const origin = invitationOrigin(req.headers.get('origin'), ALLOWED_ORIGINS, APP_URL)

    switch (body.action) {
      case 'create':
        return await createUser(caller, body, origin)
      case 'update':
        return await updateUser(caller, body)
      case 'delete':
        return await deleteUser(caller, body)
      case 'resend_invitation':
        return await resendInvitation(caller, body, origin)
    }
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message, code: err.code })
    console.error(err)
    return json(500, { error: 'Unexpected error', code: 'internal' })
  }
})
