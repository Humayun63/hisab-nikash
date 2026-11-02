import Spinner from './Spinner'

const VARIANTS = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600 disabled:bg-emerald-600/60',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600 disabled:bg-red-600/50',
}

export default function Button({ variant = 'primary', loading = false, disabled, className = '', children, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <Spinner className="text-current" />}
      {children}
    </button>
  )
}
