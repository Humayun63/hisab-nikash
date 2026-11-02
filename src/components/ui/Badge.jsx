const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
}

export default function Badge({ tone = 'slate', children }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  )
}

const STATUS = {
  invited: { tone: 'amber', label: 'Invited' },
  active: { tone: 'green', label: 'Active' },
  disabled: { tone: 'red', label: 'Disabled' },
}

export function StatusBadge({ status }) {
  const s = STATUS[status] ?? { tone: 'slate', label: status }
  return <Badge tone={s.tone}>{s.label}</Badge>
}
