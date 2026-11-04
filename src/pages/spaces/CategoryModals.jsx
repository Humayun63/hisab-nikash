import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { categorySchema } from '../../lib/validation'
import { fullName, useSpaceMembers } from '../../hooks/useOrgData'
import { useCategoryAccess } from '../../hooks/useSpaceData'
import { ROLE_LABELS } from '../../lib/roles'
import Modal from '../../components/ui/Modal'
import { TextField } from '../../components/ui/Field'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'

export const CATEGORY_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b']

function FormButtons({ onCancel, submitLabel, loading }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
      <Button variant="secondary" className="sm:w-auto" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" className="sm:w-auto" loading={loading}>
        {submitLabel}
      </Button>
    </div>
  )
}

// Create (no `category`) or edit a category. onSubmit({ name, type, color }) may throw.
export function CategoryFormModal({ category, hasEntries, onSubmit, onClose }) {
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      type: category?.type ?? 'expense',
      color: category?.color ?? CATEGORY_COLORS[0],
    },
  })
  const color = watch('color')

  async function submit(values) {
    setServerError(null)
    try {
      await onSubmit(values)
    } catch (err) {
      setServerError(err.message)
    }
  }

  return (
    <Modal open title={category ? `Edit ${category.name}` : 'New category'} onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Alert>{serverError}</Alert>
        <TextField label="Category name" autoComplete="off" error={errors.name?.message} {...register('name')} />

        {hasEntries ? (
          // Not a disabled input: react-hook-form drops disabled values, and the type must be kept.
          <div>
            <p className="text-sm font-medium text-slate-700">Type</p>
            <p className="mt-1 text-sm text-slate-900">{category.type === 'income' ? 'Income' : 'Expense'}</p>
            <p className="mt-1 text-xs text-slate-500">The type can&apos;t change because this category already has entries.</p>
          </div>
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Type</legend>
            <div className="flex gap-6">
              {['expense', 'income'].map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" value={type} {...register('type')} className="h-4 w-4 text-emerald-600 focus:ring-emerald-600" />
                  {type === 'income' ? 'Income' : 'Expense'}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">Color</legend>
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue('color', c, { shouldValidate: true })}
                aria-label={`Color ${c}`}
                aria-pressed={color.toLowerCase() === c}
                className={`h-7 w-7 rounded-full ring-offset-2 ${color.toLowerCase() === c ? 'ring-2 ring-slate-900' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="ml-2 flex items-center gap-2 text-sm text-slate-600">
              Custom
              <input type="color" value={color} onChange={(e) => setValue('color', e.target.value, { shouldValidate: true })} className="h-7 w-10 cursor-pointer rounded border border-slate-300" />
            </label>
          </div>
          {errors.color && <p className="mt-1.5 text-xs text-red-600">{errors.color.message}</p>}
        </fieldset>

        <FormButtons onCancel={onClose} submitLabel={category ? 'Save changes' : 'Create category'} loading={isSubmitting} />
      </form>
    </Modal>
  )
}

// Super admin only: everyone in the space, or only selected members.
// onSubmit({ restricted, userIds }) may throw.
export function CategoryVisibilityModal({ spaceId, category, onSubmit, onClose }) {
  const membersQuery = useSpaceMembers(spaceId)
  const accessQuery = useCategoryAccess(category.id, category.is_restricted)
  if (membersQuery.isPending || (category.is_restricted && accessQuery.isPending)) {
    return (
      <Modal open title={`Who can see ${category.name}?`} onClose={onClose}>
        <Spinner label="Loading members…" />
      </Modal>
    )
  }
  return (
    <VisibilityForm
      category={category}
      members={membersQuery.data ?? []}
      initialUserIds={accessQuery.data ?? []}
      loadError={membersQuery.error || accessQuery.error}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  )
}

function VisibilityForm({ category, members, initialUserIds, loadError, onSubmit, onClose }) {
  const [restricted, setRestricted] = useState(category.is_restricted)
  const [selected, setSelected] = useState(() => new Set(initialUserIds))
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)

  function toggle(userId) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setServerError(null)
    try {
      await onSubmit({ restricted, userIds: [...selected] })
    } catch (err) {
      setServerError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={`Who can see ${category.name}?`}
      description="Hidden categories don't appear anywhere for other members: not in lists, entries or totals. You always see every category."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Alert>{serverError || (loadError && 'Could not load members.')}</Alert>
        <fieldset className="space-y-2">
          <legend className="sr-only">Visibility</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="visibility" checked={!restricted} onChange={() => setRestricted(false)} className="h-4 w-4 text-emerald-600 focus:ring-emerald-600" />
            Everyone in this space
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name="visibility" checked={restricted} onChange={() => setRestricted(true)} className="h-4 w-4 text-emerald-600 focus:ring-emerald-600" />
            Only selected members
          </label>
        </fieldset>

        {restricted && (
          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Members who can see it</legend>
            {members.length === 0 ? (
              <p className="text-sm text-slate-500">This space has no members yet, so only you will see this category.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {members.map((m) => (
                  <li key={m.user_id}>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={selected.has(m.user_id)} onChange={() => toggle(m.user_id)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600" />
                      <span>
                        {fullName(m.profile)} <span className="text-slate-500">· {ROLE_LABELS[m.role]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        <FormButtons onCancel={onClose} submitLabel="Save visibility" loading={busy} />
      </form>
    </Modal>
  )
}
