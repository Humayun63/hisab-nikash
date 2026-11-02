import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { readUrlAuthError } from '../../lib/authErrors'
import AuthLayout from '../../components/ui/AuthLayout'
import FullPageMessage from '../../components/ui/FullPageMessage'
import Spinner from '../../components/ui/Spinner'
import NewPasswordForm from './NewPasswordForm'

// Target of the password reset email. The link signs the user in with a recovery session;
// the guards keep them here until they choose a new password.
export default function ResetPasswordPage() {
  const { session, loading, recoveryMode, finishRecovery, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [urlError] = useState(() => readUrlAuthError())

  if (loading) {
    return (
      <FullPageMessage>
        <Spinner label="Loading…" />
      </FullPageMessage>
    )
  }

  if (urlError || !session) {
    return (
      <AuthLayout title="Link not valid">
        <p role="alert" className="text-sm text-slate-600">
          {urlError ?? 'This password reset link is invalid or has expired.'}
        </p>
        <Link to="/forgot-password" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  // Signed in normally (not from a reset link): nothing to do here.
  if (!recoveryMode) return <Navigate to="/" replace />

  return (
    <AuthLayout title="Choose a new password">
      <NewPasswordForm
        onDone={async () => {
          await finishRecovery()
          await refreshProfile()
          navigate('/', { replace: true })
        }}
      />
    </AuthLayout>
  )
}
