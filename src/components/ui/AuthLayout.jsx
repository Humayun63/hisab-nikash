import Logo from './Logo'
import useDocumentTitle from './useDocumentTitle'

// Centered card used by every signed-out page (login, register, password reset…).
export default function AuthLayout({ title, subtitle, children, footer }) {
  useDocumentTitle(title)
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <Logo className="mb-6" />
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
    </main>
  )
}
