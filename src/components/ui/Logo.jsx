export default function Logo({ className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-lg font-bold text-white" aria-hidden="true">
        ৳
      </span>
      <span className="text-lg font-semibold tracking-tight text-slate-900">Hisab Nikash</span>
    </div>
  )
}
