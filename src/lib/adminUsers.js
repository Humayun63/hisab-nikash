import { supabase } from './supabaseClient'

// Calls the admin-users Edge Function and returns its JSON, or throws an Error with the
// function's message (e.g. "A user with this email already exists").
export async function invokeAdminUsers(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: { action, ...payload } })
  if (!error) return data

  let message = error.message
  let code
  try {
    const body = await error.context.json()
    message = body.error ?? message
    code = body.code
  } catch {
    // Not a JSON error body (e.g. network failure): keep supabase-js's message.
  }
  const err = new Error(message)
  err.code = code
  throw err
}

// Strong random password that satisfies the policy (letters + digits, 14 characters).
export function generatePassword(length = 14) {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = letters + digits
  const random = new Uint32Array(length)
  crypto.getRandomValues(random)
  const chars = Array.from(random, (n) => all[n % all.length])
  chars[0] = letters[random[0] % letters.length]
  chars[1] = digits[random[1] % digits.length]
  // Move the guaranteed letter/digit to random positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// Changes needed to go from the current memberships to the desired ones.
// current/desired: { [spaceId]: role }; a missing or empty role means no access.
export function diffMemberships(current, desired) {
  const add = []
  const update = []
  const remove = []
  const spaces = new Set([...Object.keys(current), ...Object.keys(desired)])
  for (const spaceId of spaces) {
    const from = current[spaceId] || null
    const to = desired[spaceId] || null
    if (!from && to) add.push({ space_id: spaceId, role: to })
    else if (from && !to) remove.push(spaceId)
    else if (from && to && from !== to) update.push({ space_id: spaceId, role: to })
  }
  return { add, update, remove }
}
