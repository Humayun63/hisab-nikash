import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useSpace } from '../../hooks/useOrgData'
import { useFileTotals, useFolders, useSpaceRole } from '../../hooks/useSpaceData'
import { hasRole, ROLE_LABELS } from '../../lib/roles'
import { formatMoney } from '../../lib/format'
import { checkWrite } from '../../lib/structureErrors'
import ConfirmDialog from '../ui/ConfirmDialog'
import NameModal from '../ui/NameModal'
import Spinner from '../ui/Spinner'

function sideLinkClass({ isActive }) {
  return `block rounded-md px-3 py-1.5 text-sm ${
    isActive ? 'bg-emerald-50 font-medium text-emerald-800' : 'text-slate-700 hover:bg-slate-100'
  }`
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

const PLUS = <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
const PENCIL = <path d="M13.59 3.59a2 2 0 0 1 2.82 2.82l-8.5 8.5a1 1 0 0 1-.47.26l-3 .75a.5.5 0 0 1-.6-.6l.75-3a1 1 0 0 1 .26-.47l8.74-8.26Z" />
const TRASH = <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.44c-.8.08-1.58.18-2.36.3a.75.75 0 1 0 .22 1.49l.15-.02.8 10.4A2.75 2.75 0 0 0 7.55 19h4.9a2.75 2.75 0 0 0 2.74-2.64l.8-10.4.15.02a.75.75 0 0 0 .22-1.49A41.5 41.5 0 0 0 14 4.19v-.44A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.67.03 2.5.08v-.33c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.33C8.33 4.03 9.16 4 10 4Z" clipRule="evenodd" />

function FolderTree({ space, canManage, onAction }) {
  const foldersQuery = useFolders(space.id)
  const totalsQuery = useFileTotals(space.id)
  const [collapsed, setCollapsed] = useState({})

  if (foldersQuery.isPending) return <Spinner className="px-3" label="Loading folders…" />
  if (foldersQuery.error) {
    return (
      <p role="alert" className="px-3 text-sm text-red-600">
        Could not load folders.
      </p>
    )
  }
  if (!foldersQuery.data.length) {
    return <p className="px-3 text-sm text-slate-500">{canManage ? 'No folders yet. Create one to start.' : 'No folders yet.'}</p>
  }

  return (
    <>
      <ul className="space-y-1">
        {foldersQuery.data.map((folder) => {
          const open = !collapsed[folder.id]
          return (
            <li key={folder.id}>
              <div className="group flex items-center gap-1 pr-1">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [folder.id]: open }))}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  <svg className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M7.2 14.8a.75.75 0 0 1 0-1.06L10.94 10 7.2 6.26a.75.75 0 1 1 1.06-1.06l4.27 4.27a.75.75 0 0 1 0 1.06L8.26 14.8a.75.75 0 0 1-1.06 0Z" />
                  </svg>
                  <span className="truncate">{folder.name}</span>
                </button>
                {canManage && (
                  <>
                    <IconButton label={`New file in ${folder.name}`} onClick={() => onAction({ type: 'new-file', folder })}>
                      {PLUS}
                    </IconButton>
                    <IconButton label={`Rename folder ${folder.name}`} onClick={() => onAction({ type: 'rename-folder', folder })}>
                      {PENCIL}
                    </IconButton>
                    <IconButton label={`Delete folder ${folder.name}`} onClick={() => onAction({ type: 'delete-folder', folder })}>
                      {TRASH}
                    </IconButton>
                  </>
                )}
              </div>
              {open && (
                <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                  {folder.files.length === 0 && <li className="px-3 py-1 text-xs text-slate-500">No files</li>}
                  {folder.files.map((file) => {
                    const totals = totalsQuery.data?.[file.id]
                    return (
                      <li key={file.id}>
                        <NavLink to={`/spaces/${space.id}/files/${file.id}`} className={sideLinkClass}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate">{file.name}</span>
                            {totals && (
                              <span className={`shrink-0 text-xs ${totals.net < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                {formatMoney(totals.net, space.currency_code, space.currency_symbol)}
                              </span>
                            )}
                          </span>
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {totalsQuery.error && (
        <p role="alert" className="mt-2 px-3 text-xs text-red-600">
          Could not load file totals.
        </p>
      )}
    </>
  )
}

// Layout for every page inside a space: a sidebar with the space's pages and its folder/file
// tree (collapsible on phones), and the page itself.
export default function SpaceLayout() {
  const { spaceId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileMatch = useMatch('/spaces/:spaceId/files/:fileId')
  const spaceQuery = useSpace(spaceId)
  const { role } = useSpaceRole(spaceId)
  // The phone menu is open for the page it was opened on, so navigating closes it.
  const [menuOpenOn, setMenuOpenOn] = useState(null)
  const menuOpen = menuOpenOn === location.pathname
  const [action, setAction] = useState(null)

  const space = spaceQuery.data
  if (spaceQuery.isPending) return <Spinner label="Loading space…" />
  if (spaceQuery.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Could not load this space. Check your connection and reload the page.
      </p>
    )
  }
  if (!space) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Space not found</h1>
        <p className="mt-1 text-sm text-slate-600">It may have been deleted, or you don&apos;t have access to it.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  const canManage = hasRole(role, 'admin')
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['folders', space.id] }),
      queryClient.invalidateQueries({ queryKey: ['file-totals', space.id] }),
    ])

  async function run(promise, thing) {
    const data = await checkWrite(promise, thing)
    await refresh()
    setAction(null)
    return data
  }

  const close = () => setAction(null)

  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <aside aria-label={`${space.name} navigation`} className="mb-6 lg:mb-0">
        <div className="flex items-center justify-between gap-3 lg:block">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-slate-900">{space.name}</p>
            <p className="text-xs text-slate-500">
              {space.currency_symbol} {space.currency_code}
              {role && ` · ${ROLE_LABELS[role]}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpenOn(menuOpen ? null : location.pathname)}
            aria-expanded={menuOpen}
            aria-controls="space-menu"
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white lg:hidden"
          >
            {menuOpen ? 'Hide menu' : 'Space menu'}
          </button>
        </div>

        <div id="space-menu" className={`${menuOpen ? 'block' : 'hidden'} mt-4 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 lg:block lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0`}>
          <nav aria-label="Space pages" className="space-y-0.5">
            <NavLink to={`/spaces/${space.id}`} end className={sideLinkClass}>
              Overview
            </NavLink>
            <NavLink to={`/spaces/${space.id}/entries`} className={sideLinkClass}>
              All entries
            </NavLink>
            {canManage && (
              <NavLink to={`/spaces/${space.id}/categories`} className={sideLinkClass}>
                Categories
              </NavLink>
            )}
            {role === 'super_admin' && (
              <NavLink to={`/spaces/${space.id}/settings`} className={sideLinkClass}>
                Settings
              </NavLink>
            )}
          </nav>

          <div className="mt-5 flex items-center justify-between px-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Folders</h2>
            {canManage && (
              <button
                type="button"
                onClick={() => setAction({ type: 'new-folder' })}
                className="text-xs font-medium text-emerald-700 hover:underline"
              >
                New folder
              </button>
            )}
          </div>
          <div className="mt-2">
            <FolderTree space={space} canManage={canManage} onAction={setAction} />
          </div>
        </div>
      </aside>

      <section className="min-w-0">
        <Outlet />
      </section>

      <NameModal
        open={action?.type === 'new-folder'}
        title="New folder"
        label="Folder name"
        submitLabel="Create folder"
        onClose={close}
        onSubmit={(name) => run(supabase.from('folders').insert({ space_id: space.id, name }), 'folder')}
      />
      <NameModal
        open={action?.type === 'rename-folder'}
        title="Rename folder"
        label="Folder name"
        initialName={action?.folder?.name}
        submitLabel="Save"
        onClose={close}
        onSubmit={(name) => run(supabase.from('folders').update({ name }).eq('id', action.folder.id).select('id'), 'folder')}
      />
      <NameModal
        open={action?.type === 'new-file'}
        title={`New file in ${action?.folder?.name ?? ''}`}
        label="File name"
        submitLabel="Create file"
        onClose={close}
        onSubmit={async (name) => {
          const file = await run(
            supabase.from('files').insert({ space_id: space.id, folder_id: action.folder.id, name }).select('id').single(),
            'file',
          )
          navigate(`/spaces/${space.id}/files/${file.id}`)
        }}
      />
      <ConfirmDialog
        open={action?.type === 'delete-folder'}
        title={`Delete folder ${action?.folder?.name ?? ''}?`}
        description="All files in this folder and all their entries will be permanently deleted."
        confirmLabel="Delete folder"
        onClose={close}
        onConfirm={async () => {
          const folder = action.folder
          const viewingInside = fileMatch && folder.files.some((f) => f.id === fileMatch.params.fileId)
          await run(supabase.from('folders').delete().eq('id', folder.id).select('id'), 'folder')
          if (viewingInside) navigate(`/spaces/${space.id}`, { replace: true })
        }}
      />
    </div>
  )
}
