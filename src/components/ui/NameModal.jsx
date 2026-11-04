import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { nameSchema } from '../../lib/validation'
import Modal from './Modal'
import { TextField } from './Field'
import Button from './Button'
import Alert from './Alert'

// Small dialog with one "Name" field, used to create or rename folders and files.
// onSubmit(name) may throw an Error whose message is shown in the dialog.
export default function NameModal({ open, title, label = 'Name', initialName = '', submitLabel, onSubmit, onClose }) {
  if (!open) return null
  return (
    <Modal open title={title} onClose={onClose}>
      <NameForm label={label} initialName={initialName} submitLabel={submitLabel} onSubmit={onSubmit} onCancel={onClose} />
    </Modal>
  )
}

function NameForm({ label, initialName, submitLabel, onSubmit, onCancel }) {
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(nameSchema), defaultValues: { name: initialName } })

  async function submit({ name }) {
    setServerError(null)
    try {
      await onSubmit(name)
    } catch (err) {
      setServerError(err.message)
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      <Alert>{serverError}</Alert>
      <TextField label={label} autoComplete="off" error={errors.name?.message} {...register('name')} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" className="sm:w-auto" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="sm:w-auto" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
