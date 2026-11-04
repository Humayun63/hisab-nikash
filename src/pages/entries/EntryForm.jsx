import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useCategories } from '../../hooks/useSpaceData'
import { invalidateEntryData, useOrgToday } from '../../hooks/useEntries'
import { entrySchema } from '../../lib/validation'
import { formatMoney } from '../../lib/format'
import { CATEGORY_GROUPS, categoryOptions, checkEntryWrite } from '../../lib/entries'
import { TextField } from '../../components/ui/Field'
import Combobox from '../../components/ui/Combobox'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Modal from '../../components/ui/Modal'

function useEntryForm(today, defaultValues) {
  return useForm({ resolver: zodResolver(entrySchema(today)), defaultValues })
}

function toRow(values) {
  return {
    amount: values.amount,
    category_id: values.categoryId,
    entry_date: values.entryDate,
    note: values.note || null,
  }
}

function Fields({ form, options, today, layout }) {
  const {
    register,
    control,
    formState: { errors },
  } = form
  return (
    <div className={layout}>
      <TextField
        label="Amount"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        error={errors.amount?.message}
        {...register('amount')}
      />
      <Controller
        name="categoryId"
        control={control}
        render={({ field }) => (
          <Combobox
            label="Category"
            options={options}
            groups={CATEGORY_GROUPS}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
            placeholder={options.length ? 'Search categories…' : 'No categories yet'}
            error={errors.categoryId?.message}
          />
        )}
      />
      <TextField label="Date" type="date" max={today} error={errors.entryDate?.message} {...register('entryDate')} />
      <TextField label="Note" autoComplete="off" maxLength={500} placeholder="Optional" error={errors.note?.message} {...register('note')} />
    </div>
  )
}

// The quick add form at the top of a file page. After saving it stays open, keeping the
// category and date, and puts the cursor back in Amount for the next entry.
export function QuickAddForm({ space, fileId }) {
  const queryClient = useQueryClient()
  const today = useOrgToday()
  const categoriesQuery = useCategories(space.id)
  const options = categoryOptions(categoriesQuery.data)
  const [serverError, setServerError] = useState(null)
  const [saved, setSaved] = useState(null)
  const form = useEntryForm(today, { amount: '', categoryId: '', entryDate: today, note: '' })
  const {
    handleSubmit,
    reset,
    setFocus,
    formState: { isSubmitting },
  } = form

  async function submit(values) {
    setServerError(null)
    setSaved(null)
    try {
      await checkEntryWrite(supabase.from('entries').insert({ ...toRow(values), space_id: space.id, file_id: fileId }))
    } catch (err) {
      setServerError(err.message)
      return
    }
    const category = options.find((o) => o.value === values.categoryId)
    setSaved(`Saved ${formatMoney(values.amount, space.currency_code, space.currency_symbol)} · ${category?.label ?? ''}`)
    reset({ amount: '', categoryId: values.categoryId, entryDate: values.entryDate, note: '' })
    setFocus('amount')
    await invalidateEntryData(queryClient, space.id)
  }

  return (
    <section aria-labelledby="quick-add-title" className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 id="quick-add-title" className="text-sm font-semibold text-slate-900">
        Add entry
      </h2>
      <form onSubmit={handleSubmit(submit)} noValidate className="mt-3 space-y-3">
        <Alert>{serverError}</Alert>
        {categoriesQuery.data && options.length === 0 && (
          <Alert tone="info">There are no categories to choose from yet. An admin can add them on the Categories page.</Alert>
        )}
        <div className="items-start gap-3 lg:flex">
          <Fields
            form={form}
            options={options}
            today={today}
            layout="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[8rem_minmax(0,1fr)_10rem_minmax(0,1.3fr)]"
          />
          <Button type="submit" loading={isSubmitting} className="mt-3 lg:mt-7 lg:w-auto">
            Add
          </Button>
        </div>
        <p role="status" className="min-h-4 text-xs text-emerald-700">
          {saved}
        </p>
      </form>
    </section>
  )
}

// Edit an existing entry (a row from space_entries) in a dialog.
export function EditEntryModal({ space, entry, onClose }) {
  const queryClient = useQueryClient()
  const today = useOrgToday()
  const categoriesQuery = useCategories(space.id)
  const options = categoryOptions(categoriesQuery.data, entry.category_id)
  const [serverError, setServerError] = useState(null)
  const form = useEntryForm(today, {
    amount: entry.amount.toFixed(2),
    categoryId: entry.category_id,
    entryDate: entry.entry_date,
    note: entry.note ?? '',
  })
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form

  async function submit(values) {
    setServerError(null)
    try {
      await checkEntryWrite(supabase.from('entries').update(toRow(values)).eq('id', entry.id).select('id'))
    } catch (err) {
      setServerError(err.message)
      return
    }
    await invalidateEntryData(queryClient, space.id)
    onClose()
  }

  return (
    <Modal open title="Edit entry" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Alert>{serverError}</Alert>
        <Fields form={form} options={options} today={today} layout="space-y-4" />
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="sm:w-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="sm:w-auto" loading={isSubmitting}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  )
}
