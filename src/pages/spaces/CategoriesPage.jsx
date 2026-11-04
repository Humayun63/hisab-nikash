import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useCategories, useCategoryUsage, useSpaceRole } from '../../hooks/useSpaceData'
import { checkWrite, structureErrorMessage } from '../../lib/structureErrors'
import Alert from '../../components/ui/Alert'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import useDocumentTitle from '../../components/ui/useDocumentTitle'
import { CategoryFormModal, CategoryVisibilityModal } from './CategoryModals'

const actionClass = 'text-sm font-medium hover:underline'

function CategoryList({ title, categories, usage, isSuperAdmin, onAction }) {
  return (
    <section aria-labelledby={`${title}-heading`} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 id={`${title}-heading`} className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
        {title} <span className="font-normal text-slate-500">({categories.length})</span>
      </h2>
      {categories.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">No {title.toLowerCase()} categories yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {categories.map((c) => {
            const count = usage[c.id] ?? 0
            return (
              <li key={c.id} aria-label={c.name} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
                  <span className={`font-medium ${c.archived_at ? 'text-slate-500' : 'text-slate-900'}`}>{c.name}</span>
                  {c.archived_at && <Badge tone="slate">Archived</Badge>}
                  {c.is_restricted && <Badge tone="amber">Selected members only</Badge>}
                  <span className="text-xs text-slate-500">
                    {count} {count === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <button type="button" className={`${actionClass} text-emerald-700`} onClick={() => onAction({ type: 'edit', category: c })} aria-label={`Edit ${c.name}`}>
                    Edit
                  </button>
                  {isSuperAdmin && (
                    <button type="button" className={`${actionClass} text-slate-700`} onClick={() => onAction({ type: 'visibility', category: c })} aria-label={`Visibility of ${c.name}`}>
                      Visibility
                    </button>
                  )}
                  <button type="button" className={`${actionClass} text-slate-700`} onClick={() => onAction({ type: 'archive', category: c })} aria-label={`${c.archived_at ? 'Restore' : 'Archive'} ${c.name}`}>
                    {c.archived_at ? 'Restore' : 'Archive'}
                  </button>
                  {count === 0 && (
                    <button type="button" className={`${actionClass} text-red-700`} onClick={() => onAction({ type: 'delete', category: c })} aria-label={`Delete ${c.name}`}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// Admins and the super admin (route guarded by RequireSpaceRole). Visibility is super admin only.
export default function CategoriesPage() {
  const { spaceId } = useParams()
  useDocumentTitle('Categories')
  const queryClient = useQueryClient()
  const categoriesQuery = useCategories(spaceId)
  const usageQuery = useCategoryUsage(spaceId)
  const { role } = useSpaceRole(spaceId)
  const isSuperAdmin = role === 'super_admin'
  const [action, setAction] = useState(null)
  const [notice, setNotice] = useState(null)

  const usage = usageQuery.data
  const categories = categoriesQuery.data ?? []
  const close = () => setAction(null)

  const refresh = (categoryId) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['categories', spaceId] }),
      queryClient.invalidateQueries({ queryKey: ['category-usage', spaceId] }),
      queryClient.invalidateQueries({ queryKey: ['file-totals', spaceId] }),
      categoryId && queryClient.invalidateQueries({ queryKey: ['category-access', categoryId] }),
    ])

  const check = (promise) => checkWrite(promise, 'category')

  async function save(values) {
    const editing = action.category
    if (editing) await check(supabase.from('categories').update(values).eq('id', editing.id).select('id'))
    else await check(supabase.from('categories').insert({ ...values, space_id: spaceId }))
    await refresh(editing?.id)
    setNotice({ tone: 'success', text: editing ? `Saved ${values.name}.` : `Created ${values.name}.` })
    close()
  }

  async function saveVisibility({ restricted, userIds }) {
    const category = action.category
    if (restricted !== category.is_restricted) {
      // Making it public also clears its access list (database trigger).
      await check(supabase.from('categories').update({ is_restricted: restricted }).eq('id', category.id).select('id'))
    }
    if (restricted) {
      const { data: current, error } = await supabase.from('category_access').select('user_id').eq('category_id', category.id)
      if (error) throw new Error(structureErrorMessage(error))
      const have = new Set(current.map((r) => r.user_id))
      const want = new Set(userIds)
      const add = userIds.filter((id) => !have.has(id))
      const remove = [...have].filter((id) => !want.has(id))
      if (add.length) await check(supabase.from('category_access').insert(add.map((user_id) => ({ category_id: category.id, user_id }))))
      if (remove.length) await check(supabase.from('category_access').delete().eq('category_id', category.id).in('user_id', remove))
    }
    await refresh(category.id)
    setNotice({
      tone: 'success',
      text: restricted ? `${category.name} is now visible to selected members only.` : `${category.name} is now visible to everyone in this space.`,
    })
    close()
  }

  async function toggleArchive(category) {
    setNotice(null)
    try {
      await check(supabase.from('categories').update({ archived_at: category.archived_at ? null : new Date().toISOString() }).eq('id', category.id).select('id'))
      await refresh(category.id)
      setNotice({
        tone: 'success',
        text: category.archived_at ? `${category.name} was restored.` : `${category.name} was archived. It stays in reports but can't be used for new entries.`,
      })
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    }
  }

  function onAction(next) {
    if (next.type === 'archive') toggleArchive(next.category)
    else setAction(next)
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Categories</h1>
          <p className="mt-1 text-sm text-slate-600">Every entry belongs to a category. Totals are grouped by category.</p>
        </div>
        <Button className="sm:w-auto" onClick={() => setAction({ type: 'edit', category: null })}>
          New category
        </Button>
      </div>

      {notice && (
        <div className="mt-6">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      {(categoriesQuery.isPending || usageQuery.isPending) && <Spinner className="mt-6" label="Loading categories…" />}
      {(categoriesQuery.error || usageQuery.error) && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          Could not load categories. Reload the page to try again.
        </p>
      )}

      {categoriesQuery.data && usageQuery.data && (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <CategoryList title="Expense" categories={categories.filter((c) => c.type === 'expense')} usage={usage} isSuperAdmin={isSuperAdmin} onAction={onAction} />
          <CategoryList title="Income" categories={categories.filter((c) => c.type === 'income')} usage={usage} isSuperAdmin={isSuperAdmin} onAction={onAction} />
        </div>
      )}

      {action?.type === 'edit' && (
        <CategoryFormModal
          category={action.category}
          hasEntries={Boolean(action.category && usage[action.category.id])}
          onSubmit={save}
          onClose={close}
        />
      )}
      {action?.type === 'visibility' && (
        <CategoryVisibilityModal spaceId={spaceId} category={action.category} onSubmit={saveVisibility} onClose={close} />
      )}
      <ConfirmDialog
        open={action?.type === 'delete'}
        title={`Delete ${action?.category?.name ?? ''}?`}
        description="This category has no entries. It will be removed permanently."
        confirmLabel="Delete category"
        onClose={close}
        onConfirm={async () => {
          const category = action.category
          await check(supabase.from('categories').delete().eq('id', category.id).select('id'))
          await refresh(category.id)
          setNotice({ tone: 'success', text: `${category.name} was deleted.` })
          close()
        }}
      />
    </>
  )
}
