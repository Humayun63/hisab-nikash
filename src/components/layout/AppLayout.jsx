import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useSpaces } from '../../hooks/useOrgData'
import Logo from '../ui/Logo'

function navClass({ isActive }) {
  return `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`
}

function SpaceSwitcher() {
  const navigate = useNavigate()
  const match = useMatch('/spaces/:spaceId/*')
  const { data: spaces = [] } = useSpaces()
  if (!spaces.length) return null

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="space-switcher" className="text-sm text-slate-500">
        Space
      </label>
      <select
        id="space-switcher"
        value={match?.params.spaceId ?? ''}
        onChange={(e) => navigate(e.target.value ? `/spaces/${e.target.value}` : '/')}
        className="max-w-[12rem] rounded-lg border-0 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-600"
      >
        <option value="">All spaces</option>
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function AppLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" aria-label="Hisab Nikash home">
            <Logo />
          </NavLink>
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-3">
          <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto">
            <NavLink to="/" end className={navClass}>
              Home
            </NavLink>
            {profile.is_super_admin && (
              <>
                <NavLink to="/settings/users" className={navClass}>
                  Users
                </NavLink>
                <NavLink to="/settings/spaces" className={navClass}>
                  Spaces
                </NavLink>
              </>
            )}
          </nav>
          <SpaceSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
