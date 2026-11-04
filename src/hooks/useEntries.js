import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { entriesRpcArgs } from '../lib/entries'
import { todayIn } from '../lib/dates'

// "Today" for entries is the organization's date, not the browser's (SPEC.md §10).
export function useOrgToday() {
  const { profile } = useAuth()
  return todayIn(profile?.organization?.timezone ?? 'Asia/Dhaka')
}

// One page of entries plus { count, income, expense } for every row matching the filters.
export function useEntries(spaceId, filters, fileId) {
  const args = entriesRpcArgs(spaceId, filters, fileId)
  return useQuery({
    queryKey: ['entries', spaceId, args],
    enabled: Boolean(spaceId),
    // Keep showing the previous page while the next one loads.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('space_entries', args)
      if (error) throw error
      const first = data[0]
      return {
        rows: data.map((row) => ({ ...row, amount: Number(row.amount) })),
        count: first ? Number(first.total_count) : 0,
        income: first ? Number(first.total_income) : 0,
        expense: first ? Number(first.total_expense) : 0,
      }
    },
  })
}

// Everyone in the organization, for the "Added by" filter (profiles are readable org-wide).
export function useOrgProfiles() {
  return useQuery({
    queryKey: ['org-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name').order('last_name')
      if (error) throw error
      return data
    },
  })
}

// Everything that shows entry numbers: the lists, the dashboard, the sidebar file totals and category counts.
export function invalidateEntryData(queryClient, spaceId) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['entries', spaceId] }),
    queryClient.invalidateQueries({ queryKey: ['file-totals', spaceId] }),
    queryClient.invalidateQueries({ queryKey: ['category-usage', spaceId] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard', spaceId] }),
  ])
}
