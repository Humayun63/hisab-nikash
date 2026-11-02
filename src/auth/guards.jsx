import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { requiredRoute, safeRedirectPath } from './routing'
import FullPageMessage from '../components/ui/FullPageMessage'
import Spinner from '../components/ui/Spinner'

const RESET_PASSWORD = '/reset-password'

function Loading() {
  return (
    <FullPageMessage>
      <Spinner label="Loading…" />
    </FullPageMessage>
  )
}

function ProfileError() {
  const { signOut, refreshProfile } = useAuth()
  return (
    <FullPageMessage title="We couldn't load your account">
      <p className="text-sm text-slate-600">Check your connection and try again.</p>
      <div className="mt-4 flex justify-center gap-4">
        <button type="button" onClick={refreshProfile} className="text-sm font-medium text-emerald-700 hover:underline">
          Try again
        </button>
        <button type="button" onClick={signOut} className="text-sm font-medium text-slate-600 hover:underline">
          Sign out
        </button>
      </div>
    </FullPageMessage>
  )
}

// Pages for signed-out visitors (login, register…). Signed-in users are sent into the app,
// back to the page they originally asked for when there was one.
export function GuestOnly() {
  const { session, loading, recoveryMode } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (session && recoveryMode) return <Navigate to={RESET_PASSWORD} replace />
  if (session) return <Navigate to={safeRedirectPath(location.state?.from)} replace />
  return <Outlet />
}

// Pages that are only valid at one step of the account lifecycle (/setup, /change-password,
// /account-disabled). `step` is the route this outlet serves.
export function RequireStep({ step }) {
  const { session, profile, profileError, loading, recoveryMode } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (recoveryMode) return <Navigate to={RESET_PASSWORD} replace />
  if (profileError) return <ProfileError />
  const target = requiredRoute({ session, profile }) ?? '/'
  if (target !== step) return <Navigate to={target} replace />
  return <Outlet />
}

// The main app: signed in, set up, enabled and with a current password.
export function RequireReady() {
  const { session, profile, profileError, loading, recoveryMode } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (recoveryMode) return <Navigate to={RESET_PASSWORD} replace />
  if (profileError) return <ProfileError />
  const target = requiredRoute({ session, profile })
  if (target) return <Navigate to={target} replace />
  return <Outlet />
}
