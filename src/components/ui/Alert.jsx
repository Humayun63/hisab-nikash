const TONES = {
  error: 'bg-red-50 text-red-800 ring-red-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
}

export default function Alert({ tone = 'error', children }) {
  if (!children) return null
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </div>
  )
}
