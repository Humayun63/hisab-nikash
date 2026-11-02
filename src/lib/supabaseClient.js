import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.')
}

// Captured before supabase-js reads and clears the tokens from the URL, so the app knows the
// page was opened from a password reset email.
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
