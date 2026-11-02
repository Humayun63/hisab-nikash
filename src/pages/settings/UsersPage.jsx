import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { fullName, useOrgUsers, useSpaces } from '../../hooks/useOrgData'
import { invokeAdminUsers } from '../../lib/adminUsers'
import { ROLE_LABELS } from '../../lib/roles'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import useDocumentTitle from '../../components/ui/useDocumentTitle'
import UserFormModal from './UserFormModal'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

const actionClass = 'text-sm font-medium hover:underline disabled:opacity-50'

export default function UsersPage() {
  useDocumentTitle('Users')
  const { profile: me } = useAuth()
  const queryClient = useQueryClient()
  const usersQuery = useOrgUsers()
  const spacesQuery = useSpaces()
  const spaces = spacesQuery.data ?? []
  const spaceName = Object.fromEntries(spaces.map((s) => [s.id, s.name]))

  const [form, setForm] = useState(null) // { mode: 'create' } | { mode: 'edit', user }
  const [deleting, setDeleting] = useState(null)
  const [resendingId, setResendingId] = useState(null)
  const [notice, setNotice] = useState(null)

  async function resend(user) {
    setResendingId(user.id)
    setNotice(null)
    try {
      const { invitation } = await invokeAdminUsers('resend_invitation', { user_id: user.id })
      setNotice(
        invitation.sent
          ? { tone: 'success', text: `Invitation sent again to ${user.email}.` }
          : { tone: 'error', text: `Could not send the invitation to ${user.email}: ${invitation.error}` },
      )
      await queryClient.invalidateQueries({ queryKey: ['org-users'] })
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    } finally {
      setResendingId(null)
    }
  }

  async function confirmDelete() {
    await invokeAdminUsers('delete', { user_id: deleting.id })
    setNotice({ tone: 'success', text: `${fullName(deleting)} was deleted.` })
    setDeleting(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['org-users'] }),
      queryClient.invalidateQueries({ queryKey: ['spaces'] }),
      queryClient.invalidateQueries({ queryKey: ['space-members'] }),
    ])
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-600">Create accounts and choose what each person can access.</p>
        </div>
        <Button className="sm:w-auto" onClick={() => setForm({ mode: 'create' })}>
          Add user
        </Button>
      </div>

      {notice && (
        <div className="mt-6">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      {usersQuery.isPending && <Spinner className="mt-6" label="Loading users…" />}
      {(usersQuery.error || spacesQuery.error) && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          Could not load {usersQuery.error ? 'users' : 'spaces'}. Reload the page to try again.
        </p>
      )}

      {usersQuery.data && (
        <div className="mt-6 overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Spaces</th>
                <th scope="col" className="px-4 py-3">Created</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersQuery.data.map((user) => {
                const isSelf = user.id === me.id
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {fullName(user)} {isSelf && <span className="text-xs font-normal text-slate-500">(you)</span>}
                      </div>
                      <div className="text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {user.is_super_admin ? <Badge tone="slate">Super admin</Badge> : <StatusBadge status={user.status} />}
                    </td>
                    <td className="px-4 py-3">
                      {user.is_super_admin ? (
                        <span className="text-slate-500">All spaces</span>
                      ) : user.space_members.length ? (
                        <ul className="flex flex-wrap gap-1">
                          {user.space_members.map((m) => (
                            <li key={m.space_id}>
                              <Badge>
                                {spaceName[m.space_id] ?? '…'} · {ROLE_LABELS[m.role]}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-500">No spaces</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{dateFormat.format(new Date(user.created_at))}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex justify-end gap-4">
                        {user.status === 'invited' && (
                          <button
                            type="button"
                            className={`${actionClass} text-slate-700`}
                            disabled={resendingId === user.id}
                            onClick={() => resend(user)}
                            aria-label={`Resend invitation to ${fullName(user)}`}
                          >
                            {resendingId === user.id ? 'Sending…' : 'Resend invite'}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${actionClass} text-emerald-700`}
                          onClick={() => setForm({ mode: 'edit', user })}
                          aria-label={`Edit ${fullName(user)}`}
                        >
                          Edit
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            className={`${actionClass} text-red-700`}
                            onClick={() => setDeleting(user)}
                            aria-label={`Delete ${fullName(user)}`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <UserFormModal
          mode={form.mode}
          user={form.user}
          spaces={spaces}
          onClose={() => setForm(null)}
          onSaved={setNotice}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting ? `Delete ${fullName(deleting)}?` : ''}
        description="They will no longer be able to sign in. Entries they added are kept and shown as added by a deleted user. This can't be undone."
        confirmLabel="Delete user"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
