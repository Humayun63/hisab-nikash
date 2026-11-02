import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../auth/AuthProvider'
import { useSpaces } from '../../hooks/useOrgData'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import useDocumentTitle from '../../components/ui/useDocumentTitle'
import SpaceForm from './SpaceForm'

export default function SpacesPage() {
  useDocumentTitle('Spaces')
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const spacesQuery = useSpaces()
  const [creating, setCreating] = useState(false)

  async function createSpace(fields) {
    const { data, error } = await supabase
      .from('spaces')
      .insert({ ...fields, org_id: profile.org_id })
      .select('id')
      .single()
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: ['spaces'] })
    setCreating(false)
    navigate(`/spaces/${data.id}/settings`)
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Spaces</h1>
          <p className="mt-1 text-sm text-slate-600">Each space has its own currency, categories, files and members.</p>
        </div>
        <Button className="sm:w-auto" onClick={() => setCreating(true)}>
          New space
        </Button>
      </div>

      {spacesQuery.isPending && <Spinner className="mt-6" label="Loading spaces…" />}
      {spacesQuery.error && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          Could not load spaces.
        </p>
      )}
      {spacesQuery.data?.length === 0 && <p className="mt-6 text-sm text-slate-600">No spaces yet.</p>}

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {spacesQuery.data?.map((space) => (
          <li key={space.id} className="flex flex-col rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="font-medium text-slate-900">{space.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {space.currency_symbol} {space.currency_code} · {space.space_members.length}{' '}
              {space.space_members.length === 1 ? 'member' : 'members'}
            </p>
            {space.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{space.description}</p>}
            <div className="mt-4 flex gap-4 text-sm font-medium">
              <Link to={`/spaces/${space.id}/settings`} className="text-emerald-700 hover:underline" aria-label={`Settings for ${space.name}`}>
                Settings
              </Link>
              <Link to={`/spaces/${space.id}`} className="text-slate-600 hover:underline" aria-label={`Open ${space.name}`}>
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <Modal open={creating} title="New space" onClose={() => setCreating(false)}>
        {creating && <SpaceForm submitLabel="Create space" onSubmit={createSpace} onCancel={() => setCreating(false)} />}
      </Modal>
    </>
  )
}
