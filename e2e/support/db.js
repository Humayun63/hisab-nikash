import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { TEST_PASSWORD } from '../fixtures/ids.js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

export function anonClient() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function signIn(email) {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Sign in as ${email} failed: ${error.message}`)
  return client
}

// Runs SQL against the linked Supabase project as the database owner (bypasses RLS).
// Returns the CLI's raw output.
export function runSql({ file, sql }) {
  const args = ['supabase', 'db', 'query', '--remote', '--yes']
  if (file) args.push('-f', file)
  else args.push(sql)
  try {
    return execFileSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 })
  } catch (err) {
    return `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
}

// Today's date (YYYY-MM-DD) in the test organization's timezone.
export function today(timeZone = 'Asia/Dhaka') {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
