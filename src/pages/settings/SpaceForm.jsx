import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { spaceSchema } from '../../lib/validation'
import { CURRENCIES, currencyByCode } from '../../lib/options'
import { SelectField, TextField } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

// Turns a database error into a message for the space form.
export function spaceErrorMessage(error) {
  if (error?.code === '23505') return 'A space with this name already exists.'
  return error?.message ?? 'Something went wrong. Please try again.'
}

// Name / description / currency form shared by "New space" and the space settings page.
// onSubmit receives the database row fields and may throw to show an error.
export default function SpaceForm({ space, submitLabel, onSubmit, onCancel }) {
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(spaceSchema),
    mode: 'onTouched',
    defaultValues: {
      name: space?.name ?? '',
      description: space?.description ?? '',
      currencyCode: space?.currency_code ?? 'BDT',
    },
  })

  async function submit(values) {
    setServerError(null)
    const currency = currencyByCode(values.currencyCode)
    try {
      await onSubmit({
        name: values.name,
        description: values.description || null,
        currency_code: currency.code,
        currency_symbol: currency.symbol,
      })
    } catch (err) {
      setServerError(spaceErrorMessage(err))
    }
  }

  const currencyKnown = !space || currencyByCode(space.currency_code)

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      <Alert>{serverError}</Alert>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Space name" autoComplete="off" error={errors.name?.message} {...register('name')} />
        <SelectField label="Currency" error={errors.currencyCode?.message} {...register('currencyCode')}>
          {!currencyKnown && <option value={space.currency_code}>{space.currency_symbol} {space.currency_code}</option>}
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.symbol} {c.code} — {c.name}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField label="Description (optional)" autoComplete="off" error={errors.description?.message} {...register('description')} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" className="sm:w-auto" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="sm:w-auto" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
