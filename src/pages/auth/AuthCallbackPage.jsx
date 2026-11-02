import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { readUrlAuthError } from '../../lib/authErrors'
import AuthLayout from '../../components/ui/AuthLayout'
import FullPageMessage from '../../components/ui/FullPageMessage'
import Spinner from '../../components/ui/Spinner'

// Signed in from an email link: record the login (this accepts a pending invitation), then
// let the root route decide where the user belongs.
function SignedInFromLink() {
  const { markLogin } = useAuth()
  const [done, setDone] = useState(false)
  useEffect(() => {
    markLogin()
      .catch(() => {}) // best effort; routing works without it
      .finally(() => setDone(true))
    // Run once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!done) {
    return (
      <FullPageMessage>
        <Spinner label="Signing you in…" />
      </FullPageMessage>
    )
  }
  return <Navigate to="/" replace />
}

// Target of email links: sign-up verification (new super admin → /setup) and invitations for
// users created by the super admin. supabase-js reads the tokens from the URL and starts a session.
export default function AuthCallbackPage() {
  const { session, loading } = useAuth()
  const [urlError] = useState(() => readUrlAuthError())

  if (urlError) {
    return (
      <AuthLayout title="Verification failed">
        <p role="alert" className="text-sm text-slate-600">
          {urlError}
        </p>
        <p className="mt-4 text-sm text-slate-600">
          Sign in to request a new verification email.{' '}
          <Link to="/login" className="font-medium text-emerald-700 hover:underline">
            Go to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  if (loading) {
    return (
      <FullPageMessage>
        <Spinner label="Verifying your email…" />
      </FullPageMessage>
    )
  }

  if (session) return <SignedInFromLink />

  return (
    <AuthLayout title="Link not valid">
      <p className="text-sm text-slate-600">
        This link is invalid or has already been used. If you already verified your email, just sign in.
      </p>
      <Link to="/login" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
        Go to sign in
      </Link>
    </AuthLayout>
  )
}
