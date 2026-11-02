import { useEffect, useId, useRef } from 'react'

// Accessible modal built on the native <dialog>: focus is trapped, Esc closes it, the first
// form field gets focus, and focus returns to the opening button afterwards. Clicking outside
// does not close it, so a half-filled form isn't lost by accident.
export default function Modal({ open, title, description, onClose, children, size = 'md' }) {
  const ref = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return undefined
    const opener = document.activeElement
    if (!dialog.open) dialog.showModal?.()
    dialog.querySelector('input:not([type=hidden]), select, textarea')?.focus()
    return () => {
      if (dialog.open) dialog.close?.()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className={`m-auto w-[calc(100%-2rem)] ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl bg-white p-0 shadow-xl backdrop:bg-slate-900/40`}
    >
      <div className="max-h-[85vh] overflow-y-auto p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
