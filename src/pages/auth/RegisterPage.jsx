import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { registerSchema } from '../../lib/validation'
import { authErrorMessage } from '../../lib/authErrors'
import AuthLayout from '../../components/ui/AuthLayout'
import { TextField } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

// Registration is for super admins only: each registration creates a new organization
// (after email verification and the setup step). Other users are created by their super admin.
export default function RegisterPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(registerSchema), mode: 'onTouched' })

  async function onSubmit(values) {
    setServerError(null)
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { first_name: values.firstName, last_name: values.lastName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setServerError(authErrorMessage(error))
      return
    }
    // With email confirmation on there is no session yet. (Supabase also returns no error for an
    // already-registered email, so we show the same screen and don't reveal whether it exists.)
    if (data.session) navigate('/', { replace: true })
    else navigate('/verify-email', { state: { email: values.email } })
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Register as a super admin to start a new organization."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-emerald-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Alert>{serverError}</Alert>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
          <TextField label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
