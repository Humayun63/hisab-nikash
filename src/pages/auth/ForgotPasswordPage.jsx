import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { forgotPasswordSchema } from '../../lib/validation'
import { authErrorMessage } from '../../lib/authErrors'
import AuthLayout from '../../components/ui/AuthLayout'
import { TextField } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState(null)
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), mode: 'onTouched' })

  async function onSubmit({ email }) {
    setServerError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setServerError(authErrorMessage(error))
      return
    }
    setSentTo(email)
  }

  const backToLogin = (
    <Link to="/login" className="font-medium text-emerald-700 hover:underline">
      Back to sign in
    </Link>
  )

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={backToLogin}>
        <p className="text-sm text-slate-600">
          If an account exists for <span className="font-medium text-slate-900">{sentTo}</span>, we&apos;ve sent a
          link to reset your password.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new password." footer={backToLogin}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Alert>{serverError}</Alert>
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Button type="submit" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
