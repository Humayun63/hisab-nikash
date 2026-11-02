import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { userCreateSchema, userEditSchema } from '../../lib/validation'
import { diffMemberships, generatePassword, invokeAdminUsers } from '../../lib/adminUsers'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../lib/roles'
import Modal from '../../components/ui/Modal'
import { SelectField, TextField } from '../../components/ui/Field'
import { Checkbox } from '../../components/ui/Checkbox'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

function accessFromMemberships(memberships = []) {
  return Object.fromEntries(memberships.map((m) => [m.space_id, m.role]))
}

function membershipList(access) {
  return Object.entries(access)
    .filter(([, role]) => role)
    .map(([space_id, role]) => ({ space_id, role }))
}

function SpaceAccessFields({ spaces, register }) {
  if (!spaces.length) return null
  return (
    <fieldset className="space-y-3 border-t border-slate-200 pt-4">
      <legend className="text-sm font-semibold text-slate-900">Space access</legend>
      <p className="text-xs text-slate-500">
        {ROLE_LABELS.viewer}: {ROLE_DESCRIPTIONS.viewer.toLowerCase()}. {ROLE_LABELS.editor}:{' '}
        {ROLE_DESCRIPTIONS.editor.toLowerCase()}. {ROLE_LABELS.admin}: {ROLE_DESCRIPTIONS.admin.toLowerCase()}.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {spaces.map((space) => (
          <SelectField key={space.id} label={space.name} {...register(`access.${space.id}`)}>
            <option value="">No access</option>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </SelectField>
        ))}
      </div>
    </fieldset>
  )
}

// Create a user (mode "create") or edit one (mode "edit", with `user`).
// onSaved(notice) is called with a message for the users page.
export default function UserFormModal({ mode, user, spaces, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const queryClient = useQueryClient()
  const { profile: me, refreshProfile } = useAuth()
  const isSelf = isEdit && user.id === me.id
  const [serverError, setServerError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(isEdit ? userEditSchema : userCreateSchema),
    mode: 'onTouched',
    defaultValues: isEdit
      ? {
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          password: '',
          mustChangePassword: true,
          enabled: user.status !== 'disabled',
          access: accessFromMemberships(user.space_members),
        }
      : { firstName: '', lastName: '', email: '', password: '', mustChangePassword: true, access: {} },
  })

  const newPassword = watch('password')

  function fillGeneratedPassword() {
    setValue('password', generatePassword(), { shouldValidate: true, shouldDirty: true })
    setShowPassword(true)
  }

  async function onSubmit(values) {
    setServerError(null)
    try {
      if (!isEdit) {
        const result = await invokeAdminUsers('create', {
          first_name: values.firstName,
          last_name: values.lastName,
          email: values.email,
          password: values.password,
          must_change_password: values.mustChangePassword,
          memberships: membershipList(values.access),
        })
        onSaved(
          result.invitation?.sent
            ? { tone: 'success', text: `${values.firstName} ${values.lastName} was added and an invitation was sent to ${values.email}.` }
            : {
                tone: 'info',
                text: `${values.firstName} ${values.lastName} was added, but the invitation email could not be sent (${result.invitation?.error ?? 'unknown error'}). They can still sign in with the email and password you set. Share them directly.`,
              },
        )
      } else {
        const changes = {}
        if (values.firstName !== user.first_name) changes.first_name = values.firstName
        if (values.lastName !== user.last_name) changes.last_name = values.lastName
        if (values.email.toLowerCase() !== user.email.toLowerCase()) changes.email = values.email
        if (values.password) {
          changes.password = values.password
          // The super admin isn't forced to change a password they just chose for themselves.
          if (!isSelf) changes.must_change_password = values.mustChangePassword
        }
        if (!isSelf) {
          const wasEnabled = user.status !== 'disabled'
          if (values.enabled !== wasEnabled) changes.status = values.enabled ? 'active' : 'disabled'
          const { add, update, remove } = diffMemberships(accessFromMemberships(user.space_members), values.access)
          if (add.length || update.length || remove.length) changes.memberships = membershipList(values.access)
        }

        // One request: profile, password, status and space access are saved together.
        if (Object.keys(changes).length) await invokeAdminUsers('update', { user_id: user.id, ...changes })
        if (isSelf) await refreshProfile()
        onSaved({ tone: 'success', text: `Saved changes to ${values.firstName} ${values.lastName}.` })
      }
      onClose()
    } catch (err) {
      setServerError(err.message)
    } finally {
      // Refresh even after an error: part of the change may have been saved.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['org-users'] }),
        queryClient.invalidateQueries({ queryKey: ['spaces'] }),
        queryClient.invalidateQueries({ queryKey: ['space-members'] }),
      ])
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={isEdit ? `Edit ${user.first_name} ${user.last_name}` : 'Add user'}
      description={
        isEdit
          ? undefined
          : 'The account works right away with the password you set. They also get an invitation email (without the password).'
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Alert>{serverError}</Alert>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="First name" autoComplete="off" error={errors.firstName?.message} {...register('firstName')} />
          <TextField label="Last name" autoComplete="off" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <TextField label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />

        <div>
          <TextField
            label={isEdit ? 'New password' : 'Password'}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            hint={isEdit ? 'Leave blank to keep the current password.' : 'At least 8 characters, with a letter and a number.'}
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="mt-2 flex gap-4">
            <button type="button" onClick={fillGeneratedPassword} className="text-sm font-medium text-emerald-700 hover:underline">
              Generate password
            </button>
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
              className="text-sm font-medium text-slate-600 hover:underline"
            >
              {showPassword ? 'Hide password' : 'Show password'}
            </button>
          </div>
        </div>

        {(!isEdit || (newPassword && !isSelf)) && (
          <Checkbox
            label="Require a new password at first sign-in"
            hint="Recommended. They choose their own password before using the app."
            {...register('mustChangePassword')}
          />
        )}

        {isEdit && !isSelf && (
          <Checkbox
            label="Account enabled"
            hint="Disabled users can't sign in. Their entries are kept."
            {...register('enabled')}
          />
        )}

        {!isSelf && <SpaceAccessFields spaces={spaces} register={register} />}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="sm:w-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="sm:w-auto" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Add user'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
