import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { openedFromRecoveryLink, supabase } from '../lib/supabaseClient'
import { resetLanding } from '../lib/lastSpace'

const AuthContext = createContext(null)

// While set, the user arrived through a password reset link and must choose a new password
// before using the app. Kept in sessionStorage so a reload doesn't skip the step.
const RECOVERY_KEY = 'hisab-nikash.recovery'

function readRecoveryFlag() {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}

function writeRecoveryFlag(on) {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1')
    else sessionStorage.removeItem(RECOVERY_KEY)
  } catch {
    // Storage unavailable (private mode): the flag then only lives in memory.
  }
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, organization:organizations(*)')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data // null when the user hasn't set up an organization yet
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(() => {
    if (openedFromRecoveryLink) writeRecoveryFlag(true)
    return openedFromRecoveryLink || readRecoveryFlag()
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setSessionLoading(false)
      if (event === 'PASSWORD_RECOVERY') {
        writeRecoveryFlag(true)
        setRecoveryMode(true)
      }
      if (event === 'SIGNED_OUT') {
        writeRecoveryFlag(false)
        setRecoveryMode(false)
        resetLanding()
        // Drop everything cached for the previous user (spaces, users…), not just the profile.
        queryClient.clear()
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [queryClient])

  const userId = session?.user?.id
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId),
    enabled: Boolean(userId),
    staleTime: 60_000,
    // Picks up changes made by the super admin (e.g. disabling the account) when the user returns to the tab.
    refetchOnWindowFocus: true,
  })

  const refreshProfile = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
    [queryClient, userId],
  )

  // Records the login and accepts a pending invitation (no-op for disabled users or users without a profile).
  const markLogin = useCallback(
    async (id) => {
      await supabase.rpc('mark_login')
      await queryClient.invalidateQueries({ queryKey: ['profile', id] })
    },
    [queryClient],
  )

  const signIn = useCallback(
    async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error }
      await markLogin(data.user.id)
      return { error: null }
    },
    [markLogin],
  )

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    // If the server can't be reached, still end the session in this browser.
    if (error) await supabase.auth.signOut({ scope: 'local' })
  }, [])

  // Called once the user has set a new password from a reset link.
  const finishRecovery = useCallback(async () => {
    writeRecoveryFlag(false)
    setRecoveryMode(false)
    if (userId) await markLogin(userId)
  }, [markLogin, userId])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile: profileQuery.data ?? null,
      profileError: profileQuery.error,
      loading: sessionLoading || (Boolean(userId) && profileQuery.isPending),
      recoveryMode,
      signIn,
      signOut,
      refreshProfile,
      finishRecovery,
      markLogin: () => (userId ? markLogin(userId) : Promise.resolve()),
    }),
    [session, userId, profileQuery.data, profileQuery.error, profileQuery.isPending, sessionLoading, recoveryMode, signIn, signOut, refreshProfile, finishRecovery, markLogin],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
