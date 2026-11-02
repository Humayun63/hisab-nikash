import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '../../lib/supabaseClient'
import { newPasswordSchema } from '../../lib/validation'
import { authErrorMessage } from '../../lib/authErrors'
import { TextField } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

// Sets a new password for the signed-in user (after a reset link, or a forced change on first login).
export default function NewPasswordForm({ submitLabel = 'Save new password', onDone }) {
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(newPasswordSchema), mode: 'onTouched' })

  async function onSubmit({ password }) {
    setServerError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setServerError(authErrorMessage(error))
      return
    }
    // A database trigger clears "must change password" when the password changes.
    await onDone?.()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Alert>{serverError}</Alert>
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with a letter and a number."
        error={errors.password?.message}
        {...register('password')}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />
      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  )
}
