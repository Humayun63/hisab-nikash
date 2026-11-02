import { useAuth } from '../../auth/AuthProvider'
import { DISABLED_MESSAGE } from '../../lib/authErrors'
import AuthLayout from '../../components/ui/AuthLayout'
import Button from '../../components/ui/Button'

export default function AccountDisabledPage() {
  const { signOut } = useAuth()
  return (
    <AuthLayout title="Account disabled">
      <p role="alert" className="text-sm text-slate-600">
        {DISABLED_MESSAGE}
      </p>
      <Button variant="secondary" className="mt-6" onClick={signOut}>
        Sign out
      </Button>
    </AuthLayout>
  )
}
