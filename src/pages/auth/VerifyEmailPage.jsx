import { Link, Navigate, useLocation } from 'react-router-dom'
import AuthLayout from '../../components/ui/AuthLayout'
import ResendVerification from './ResendVerification'

// Shown right after registering.
export default function VerifyEmailPage() {
  const email = useLocation().state?.email
  if (!email) return <Navigate to="/login" replace />

  return (
    <AuthLayout
      title="Check your email"
      footer={
        <Link to="/login" className="font-medium text-emerald-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <p className="text-sm text-slate-600">
        We sent a verification link to <span className="font-medium text-slate-900">{email}</span>. Click it to
        verify your account, then sign in to set up your organization.
      </p>
      <p className="mt-3 text-sm text-slate-500">Can&apos;t find it? Check your spam folder.</p>
      <div className="mt-6">
        <ResendVerification email={email} />
      </div>
    </AuthLayout>
  )
}
