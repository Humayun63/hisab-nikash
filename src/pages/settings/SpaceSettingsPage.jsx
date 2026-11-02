import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { fullName, useOrgUsers, useSpace, useSpaceMembers } from '../../hooks/useOrgData'
import { ROLE_LABELS } from '../../lib/roles'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SelectField } from '../../components/ui/Field'
import Spinner from '../../components/ui/Spinner'
import useDocumentTitle from '../../components/ui/useDocumentTitle'
import SpaceForm from './SpaceForm'

function Section({ title, description, children }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6" aria-label={title}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function useInvalidateSpace(spaceId) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['spaces'] }),
      queryClient.invalidateQueries({ queryKey: ['space-members', spaceId] }),
      queryClient.invalidateQueries({ queryKey: ['org-users'] }),
    ])
}

function MembersSection({ space }) {
  const membersQuery = useSpaceMembers(space.id)
  const usersQuery = useOrgUsers()
  const invalidate = useInvalidateSpace(space.id)
  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [removing, setRemoving] = useState(null)

  const members = membersQuery.data ?? []
  const memberIds = new Set(members.map((m) => m.user_id))
  // The super admin already sees every space, so they're never added as a member.
  const candidates = (usersQuery.data ?? []).filter((u) => !u.is_super_admin && !memberIds.has(u.id))

  async function run(action, success) {
    setBusy(true)
    setNotice(null)
    try {
      const { error } = await action()
      if (error) throw error
      await invalidate()
      setNotice({ tone: 'success', text: success })
      return true
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addMember(event) {
    event.preventDefault()
    if (!newUserId) return
    const user = candidates.find((u) => u.id === newUserId)
    const ok = await run(
      () => supabase.from('space_members').insert({ space_id: space.id, user_id: newUserId, role: newRole }),
      `${fullName(user)} added as ${ROLE_LABELS[newRole]}.`,
    )
    if (ok) setNewUserId('')
  }

  function changeRole(member, role) {
    return run(
      () => supabase.from('space_members').update({ role }).eq('space_id', space.id).eq('user_id', member.user_id),
      `${fullName(member.profile)} is now ${ROLE_LABELS[role]}.`,
    )
  }

  async function confirmRemove() {
    const member = removing
    const { error } = await supabase.from('space_members').delete().eq('space_id', space.id).eq('user_id', member.user_id)
    if (error) throw error
    await invalidate()
    setNotice({ tone: 'success', text: `${fullName(member.profile)} was removed from ${space.name}.` })
    setRemoving(null)
  }

  return (
    <Section title="Members" description="Who can open this space, and what they can do in it.">
      {notice && (
        <div className="mb-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      {membersQuery.isPending ? (
        <Spinner label="Loading members…" />
      ) : membersQuery.error ? (
        <p role="alert" className="text-sm text-red-600">
          Could not load members.
        </p>
      ) : members.length === 0 ? (
        <p className="text-sm text-slate-600">No members yet. You (super admin) can always access this space.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {members.map((member) => (
            <li key={member.user_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label={fullName(member.profile)}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {fullName(member.profile)} <StatusBadge status={member.profile?.status} />
                </p>
                <p className="truncate text-sm text-slate-500">{member.profile?.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                  Role for {fullName(member.profile)}
                </label>
                <select
                  id={`role-${member.user_id}`}
                  value={member.role}
                  disabled={busy}
                  onChange={(e) => changeRole(member, e.target.value)}
                  className="rounded-lg border-0 py-1.5 pl-3 pr-8 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="button"
                  onClick={() => setRemoving(member)}
                  className="text-sm font-medium text-red-700 hover:underline"
                  aria-label={`Remove ${fullName(member.profile)}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addMember} className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-200 pt-5 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <SelectField label="Add a member" value={newUserId} onChange={(e) => setNewUserId(e.target.value)}>
          <option value="">{candidates.length ? 'Choose a user…' : 'Everyone is already a member'}</option>
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {fullName(u)} ({u.email}){u.status === 'disabled' ? ' — disabled' : ''}
            </option>
          ))}
        </SelectField>
        <SelectField label="Role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </SelectField>
        <Button type="submit" className="sm:w-auto" disabled={!newUserId} loading={busy}>
          Add
        </Button>
      </form>
      <p className="mt-3 text-xs text-slate-500">
        Need someone new? <Link to="/settings/users" className="font-medium text-emerald-700 hover:underline">Create a user</Link> first.
      </p>

      <ConfirmDialog
        open={Boolean(removing)}
        title={removing ? `Remove ${fullName(removing.profile)} from ${space.name}?` : ''}
        description="They will lose access to this space. Entries they added are kept."
        confirmLabel="Remove member"
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </Section>
  )
}

export default function SpaceSettingsPage() {
  const { spaceId } = useParams()
  const navigate = useNavigate()
  const spaceQuery = useSpace(spaceId)
  const invalidate = useInvalidateSpace(spaceId)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const space = spaceQuery.data
  useDocumentTitle(space ? `${space.name} settings` : 'Space settings')

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
        <Link to="/settings/spaces" className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline">
          Back to spaces
        </Link>
      </div>
    )
  }

  async function saveGeneral(fields) {
    setSaved(false)
    const { error } = await supabase.from('spaces').update(fields).eq('id', space.id)
    if (error) throw error
    await invalidate()
    setSaved(true)
  }

  async function deleteSpace() {
    const { error } = await supabase.from('spaces').delete().eq('id', space.id)
    if (error) throw error
    // Leave first, so this page doesn't refetch the deleted space and flash "not found".
    navigate('/settings/spaces', { replace: true })
    await invalidate()
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <Link to="/settings/spaces" className="hover:underline">
          Spaces
        </Link>{' '}
        / <span className="text-slate-700">{space.name}</span>
      </nav>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">{space.name} settings</h1>

      <div className="mt-6 space-y-6">
        <Section title="General">
          {saved && (
            <div className="mb-4">
              <Alert tone="success">Space details saved.</Alert>
            </div>
          )}
          <SpaceForm key={space.id} space={space} submitLabel="Save changes" onSubmit={saveGeneral} />
        </Section>

        <MembersSection space={space} />

        <Section title="Delete space" description="Deletes all folders, files, categories and entries in this space. This can't be undone.">
          <Button variant="danger" className="sm:w-auto" onClick={() => setDeleting(true)}>
            Delete this space
          </Button>
        </Section>
      </div>

      <ConfirmDialog
        open={deleting}
        title={`Delete ${space.name}?`}
        description="All folders, files, categories and entries in this space will be permanently deleted."
        confirmLabel="Delete space"
        confirmText={space.name}
        onConfirm={deleteSpace}
        onClose={() => setDeleting(false)}
      />
    </>
  )
}
