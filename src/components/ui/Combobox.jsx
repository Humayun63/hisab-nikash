import { forwardRef, useId, useState } from 'react'

// Searchable single-select (WAI-ARIA combobox with a listbox popup). Options are
// { value, label, group?, color? } and are shown under their group's heading, in `groups` order.
// Typing filters; ↑/↓ move, Enter picks, Esc closes. With the list closed, Enter submits the form.
const Combobox = forwardRef(function Combobox(
  { label, options, groups = [], value, onChange, onBlur, error, hint, placeholder = 'Search…', name },
  ref,
) {
  const id = useId()
  const listId = `${id}-list`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)

  const selected = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  // Grouped order is also the keyboard order.
  const sections = groups.length
    ? groups.map((g) => ({ ...g, options: filtered.filter((o) => o.group === g.value) })).filter((s) => s.options.length)
    : [{ value: '', label: '', options: filtered }]
  const ordered = sections.flatMap((s) => s.options)

  function openList() {
    setOpen(true)
    setActive(Math.max(0, ordered.findIndex((o) => o.value === value)))
  }

  function close() {
    setOpen(false)
    setQuery('')
    setActive(-1)
  }

  function pick(option) {
    onChange(option.value)
    close()
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return openList()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (ordered.length ? (i + step + ordered.length) % ordered.length : -1))
    } else if (event.key === 'Enter' && open) {
      const option = ordered[active] ?? (ordered.length === 1 ? ordered[0] : null)
      if (option) {
        event.preventDefault()
        pick(option)
      }
    } else if (event.key === 'Escape' && open) {
      // Close the list only, not a surrounding dialog.
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined
  const activeId = open && ordered[active] ? `${id}-opt-${ordered[active].value}` : undefined

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        {selected?.color && !open && (
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-2.5 w-2.5 -translate-y-1/2 rounded-full" style={{ backgroundColor: selected.color }} />
        )}
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder={selected ? undefined : placeholder}
          value={open ? query : (selected?.label ?? '')}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onClick={() => (open ? close() : openList())}
          onKeyDown={onKeyDown}
          onBlur={() => {
            close()
            onBlur?.()
          }}
          className={`block w-full rounded-lg border-0 bg-white py-2 pr-9 text-sm text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:outline-none ${
            selected?.color && !open ? 'pl-8' : 'pl-3'
          } ${error ? 'ring-red-400 focus:ring-red-500' : 'ring-slate-300 focus:ring-emerald-600'}`}
        />
        <svg className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          // Keep focus in the input while clicking an option.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200"
        >
          {ordered.length === 0 && <li className="px-3 py-2 text-slate-500">No matches</li>}
          {sections.map((section) => {
            const items = section.options.map((option) => {
              const index = ordered.indexOf(option)
              return (
                <li
                  key={option.value}
                  id={`${id}-opt-${option.value}`}
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => pick(option)}
                  onMouseMove={() => setActive(index)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${index === active ? 'bg-emerald-50 text-emerald-900' : 'text-slate-800'}`}
                >
                  {option.color && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
                  <span className="truncate">{option.label}</span>
                  {option.value === value && <span className="ml-auto text-xs text-emerald-700">Selected</span>}
                </li>
              )
            })
            if (!section.label) return items
            return (
              <li key={section.value} role="presentation">
                <div id={`${id}-group-${section.value}`} role="presentation" className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {section.label}
                </div>
                <ul role="group" aria-labelledby={`${id}-group-${section.value}`}>
                  {items}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
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
})

export default Combobox
