import { forwardRef, useId } from 'react'

export const Checkbox = forwardRef(function Checkbox({ label, hint, ...props }, ref) {
  const id = useId()
  return (
    <div className="flex gap-3">
      <input
        ref={ref}
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
        {...props}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-slate-500">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
})
