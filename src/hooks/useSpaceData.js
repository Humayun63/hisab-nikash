import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { roleInSpace } from '../lib/roles'
import { useSpaces } from './useOrgData'

// The current user's role in a space: 'super_admin' | 'admin' | 'editor' | 'viewer' | null.
export function useSpaceRole(spaceId) {
  const { profile } = useAuth()
  const spacesQuery = useSpaces()
  const space = spacesQuery.data?.find((s) => s.id === spaceId)
  return {
    role: space ? roleInSpace(profile, space) : null,
    isPending: spacesQuery.isPending,
    error: spacesQuery.error,
  }
}

// Folders of a space with their files, both sorted by name.
export function useFolders(spaceId) {
  return useQuery({
    queryKey: ['folders', spaceId],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('folders')
        .select('id, name, created_at, files(id, name, folder_id, created_at)')
        .eq('space_id', spaceId)
        .order('name')
      if (error) throw error
      return data.map((folder) => ({
        ...folder,
        files: [...folder.files].sort((a, b) => a.name.localeCompare(b.name)),
      }))
    },
  })
}

// { [fileId]: { income, expense, net, entryCount } } for files with visible entries.
export function useFileTotals(spaceId) {
  return useQuery({
    queryKey: ['file-totals', spaceId],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('space_file_totals', { p_space_id: spaceId })
      if (error) throw error
      return Object.fromEntries(
        data.map((row) => {
          const income = Number(row.income)
          const expense = Number(row.expense)
          // Round to cents so float noise can't produce a "-0.00" net; `|| 0` turns -0 into 0.
          const net = Math.round((income - expense) * 100) / 100 || 0
          return [row.file_id, { income, expense, net, entryCount: Number(row.entry_count) }]
        }),
      )
    },
  })
}

export function useCategories(spaceId) {
  return useQuery({
    queryKey: ['categories', spaceId],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, type, color, is_restricted, archived_at, created_at')
        .eq('space_id', spaceId)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

// { [categoryId]: number of entries the caller can see }
export function useCategoryUsage(spaceId) {
  return useQuery({
    queryKey: ['category-usage', spaceId],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('space_category_usage', { p_space_id: spaceId })
      if (error) throw error
      return Object.fromEntries(data.map((row) => [row.category_id, Number(row.entry_count)]))
    },
  })
}

// User ids allowed to see a restricted category (super admin only).
export function useCategoryAccess(categoryId, enabled = true) {
  return useQuery({
    queryKey: ['category-access', categoryId],
    enabled: Boolean(categoryId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('category_access').select('user_id').eq('category_id', categoryId)
      if (error) throw error
      return data.map((row) => row.user_id)
    },
  })
}
