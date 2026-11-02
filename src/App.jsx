import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

// Temporary page to confirm the Supabase connection. Replaced once routing is added.
export default function App() {
  const [status, setStatus] = useState({ state: 'checking', message: 'Connecting to Supabase…' })

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (error) throw error
        return fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        })
      })
      .then((res) => {
        if (!res.ok) throw new Error(`Auth health check failed (${res.status})`)
        setStatus({ state: 'ok', message: 'Connected to Supabase.' })
      })
      .catch((err) => setStatus({ state: 'error', message: err.message }))
  }, [])

  const color = {
    checking: 'text-slate-500',
    ok: 'text-emerald-600',
    error: 'text-red-600',
  }[status.state]

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Hisab Nikash</h1>
        <p className={`mt-2 text-sm ${color}`}>{status.message}</p>
        <p className="mt-4 text-xs text-slate-400 break-all">{import.meta.env.VITE_SUPABASE_URL}</p>
      </div>
    </main>
  )
}
