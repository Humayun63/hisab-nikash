import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { loginSchema } from '../../lib/validation'
import { authErrorMessage } from '../../lib/authErrors'
import AuthLayout from '../../components/ui/AuthLayout'
import { TextField } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import ResendVerification from './ResendVerification'

export default function LoginPage() {
  const { signIn } = useAuth()
  const location = useLocation()
  const [serverError, setServerError] = useState(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState(null)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), mode: 'onTouched' })

  async function onSubmit(values) {
    setServerError(null)
    setUnverifiedEmail(null)
    const { error } = await signIn(values)
    if (!error) return // GuestOnly redirects once the session is set
    setServerError(authErrorMessage(error))
    // Supabase may hide "not confirmed" behind invalid_credentials, so offer a resend for both.
    if (error.code === 'email_not_confirmed' || error.code === 'invalid_credentials') {
      setUnverifiedEmail(getValues('email').trim())
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to Hisab Nikash."
      footer={
        <>
          New organization?{' '}
          <Link to="/register" className="font-medium text-emerald-700 hover:underline">
            Register as super admin
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Alert tone="info">{location.state?.message}</Alert>
        <Alert>{serverError}</Alert>
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-emerald-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      {unverifiedEmail && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="mb-2 text-sm text-slate-600">Haven&apos;t verified your email yet?</p>
          <ResendVerification email={unverifiedEmail} />
        </div>
      )}
    </AuthLayout>
  )
}
