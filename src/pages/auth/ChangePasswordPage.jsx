import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import AuthLayout from '../../components/ui/AuthLayout'
import NewPasswordForm from './NewPasswordForm'

// Forced password change for users whose account was created with a password set by the super admin.
export default function ChangePasswordPage() {
  const { profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <AuthLayout
      title="Set your own password"
      subtitle={`Welcome, ${profile.first_name}! Your account was created with a temporary password. Choose a new one to continue.`}
      footer={
        <button type="button" onClick={signOut} className="font-medium text-emerald-700 hover:underline">
          Sign out
        </button>
      }
    >
      <NewPasswordForm
        submitLabel="Set password and continue"
        onDone={async () => {
          await refreshProfile()
          navigate('/', { replace: true })
        }}
      />
    </AuthLayout>
  )
}
