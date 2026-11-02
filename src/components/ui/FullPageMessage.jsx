export default function FullPageMessage({ title, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        {title && <h1 className="mb-2 text-lg font-semibold text-slate-900">{title}</h1>}
        {children}
      </div>
    </main>
  )
}
