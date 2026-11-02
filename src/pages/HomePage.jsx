import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useSpaces } from '../hooks/useOrgData'
import { ROLE_LABELS, roleInSpace } from '../lib/roles'
import Spinner from '../components/ui/Spinner'
import useDocumentTitle from '../components/ui/useDocumentTitle'

// Landing page until the dashboard (milestone 6): the spaces the user can open.
export default function HomePage() {
  const { profile } = useAuth()
  const spacesQuery = useSpaces()
  useDocumentTitle('Home')

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Welcome, {profile.first_name}</h1>
      <p className="mt-1 text-sm text-slate-600">{profile.organization?.name}</p>

      <section className="mt-8" aria-labelledby="spaces-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="spaces-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your spaces
          </h2>
          {profile.is_super_admin && (
            <Link to="/settings/spaces" className="text-sm font-medium text-emerald-700 hover:underline">
              Manage spaces
            </Link>
          )}
        </div>
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
            <li key={space.id}>
              <Link
                to={`/spaces/${space.id}`}
                className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-emerald-300"
              >
                <p className="font-medium text-slate-900">{space.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {space.currency_symbol} {space.currency_code} · {ROLE_LABELS[roleInSpace(profile, space)] ?? '—'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
