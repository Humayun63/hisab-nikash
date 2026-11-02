import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import Logo from '../components/ui/Logo'
import Spinner from '../components/ui/Spinner'
import useDocumentTitle from '../components/ui/useDocumentTitle'

const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }

// Placeholder landing page until the dashboard (milestone 6): shows who is signed in and
// which spaces they can open.
export default function HomePage() {
  const { profile, signOut } = useAuth()
  useDocumentTitle('Home')

  const spacesQuery = useQuery({
    queryKey: ['spaces', profile.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spaces')
        .select('id, name, currency_code, currency_symbol, space_members(user_id, role)')
        .order('name')
      if (error) throw error
      return data
    },
  })

  function roleIn(space) {
    if (profile.is_super_admin) return 'Super admin'
    const membership = space.space_members.find((m) => m.user_id === profile.id)
    return ROLE_LABELS[membership?.role] ?? '—'
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">
                {profile.first_name} {profile.last_name}
              </p>
              <p className="text-xs text-slate-500">{profile.organization?.name}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Welcome, {profile.first_name}</h1>
        <p className="mt-1 text-sm text-slate-600">{profile.organization?.name}</p>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your spaces</h2>
          {spacesQuery.isPending && <Spinner className="mt-4" label="Loading spaces…" />}
          {spacesQuery.error && (
            <p role="alert" className="mt-4 text-sm text-red-600">
              Could not load spaces.
            </p>
          )}
          {spacesQuery.data?.length === 0 && (
            <p className="mt-4 text-sm text-slate-600">You haven&apos;t been added to any space yet.</p>
          )}
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spacesQuery.data?.map((space) => (
              <li key={space.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="font-medium text-slate-900">{space.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {space.currency_symbol} {space.currency_code} · {roleIn(space)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
