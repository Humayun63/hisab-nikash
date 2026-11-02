import { forwardRef, useId } from 'react'

const INPUT =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:outline-none'

function inputClasses(error) {
  return `${INPUT} ${error ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-emerald-600'}`
}

function FieldShell({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id, error, hint) {
  const ids = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

export const TextField = forwardRef(function TextField({ label, error, hint, type = 'text', ...props }, ref) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        ref={ref}
        id={id}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClasses(error)}
        {...props}
      />
    </FieldShell>
  )
})

export const SelectField = forwardRef(function SelectField({ label, error, hint, children, ...props }, ref) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputClasses(error)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
})
