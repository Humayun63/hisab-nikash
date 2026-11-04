import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

// Numbers are aggregated in Postgres (SPEC.md §7); these only convert numeric strings.
function useRpc(name, args, select) {
  return useQuery({
    queryKey: ['dashboard', args.p_space_id, name, args],
    enabled: Boolean(args.p_space_id),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(name, args)
      if (error) throw error
      return select(data)
    },
  })
}

const num = (v) => Number(v) || 0

function scopeArgs(spaceId, { from, to, folderId, fileId }) {
  return { p_space_id: spaceId, p_from: from, p_to: to, p_folder_id: folderId || null, p_file_id: fileId || null }
}

export function useDashboardSummary(spaceId, scope) {
  return useRpc('dashboard_summary', scopeArgs(spaceId, scope), (rows) => {
    const r = rows[0] ?? {}
    return {
      income: num(r.income),
      expense: num(r.expense),
      net: num(r.net),
      count: num(r.entry_count),
      prevIncome: num(r.prev_income),
      prevExpense: num(r.prev_expense),
      prevNet: num(r.prev_net),
    }
  })
}

export function useDashboardByCategory(spaceId, scope) {
  return useRpc('dashboard_by_category', scopeArgs(spaceId, scope), (rows) =>
    rows.map((r) => ({ ...r, total: num(r.total), entry_count: num(r.entry_count) })),
  )
}

export function useDashboardTrend(spaceId, scope, bucket) {
  return useRpc('dashboard_trend', { ...scopeArgs(spaceId, scope), p_bucket: bucket }, (rows) =>
    rows.map((r) => ({ bucket: r.bucket_start, income: num(r.income), expense: num(r.expense) })),
  )
}

// The latest 10 entries in the scope, whatever the period.
export function useRecentEntries(spaceId, { folderId, fileId }) {
  const args = {
    p_space_id: spaceId,
    p_file_id: fileId || null,
    p_folder_id: folderId || null,
    p_sort: 'date',
    p_desc: true,
    p_limit: 10,
    p_offset: 0,
  }
  return useRpc('space_entries', args, (rows) => rows.map((r) => ({ ...r, amount: num(r.amount) })))
}
