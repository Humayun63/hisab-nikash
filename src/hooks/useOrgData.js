import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

// Spaces the current user can see (all of them for the super admin), with their members.
export function useSpaces() {
  return useQuery({
    queryKey: ['spaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spaces')
        .select('id, name, description, currency_code, currency_symbol, created_at, space_members(user_id, role)')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useSpace(spaceId) {
  return useQuery({
    queryKey: ['spaces', spaceId],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('spaces')
        .select('id, name, description, currency_code, currency_symbol, created_at')
        .eq('id', spaceId)
        .maybeSingle()
      if (error) throw error
      return data // null when it doesn't exist or isn't visible
    },
  })
}

// Members of one space with their profiles.
export function useSpaceMembers(spaceId) {
  return useQuery({
    queryKey: ['space-members', spaceId],
    enabled: Boolean(spaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('space_members')
        .select('user_id, role, created_at, profile:profiles(id, first_name, last_name, email, status)')
        .eq('space_id', spaceId)
      if (error) throw error
      return data.sort((a, b) => fullName(a.profile).localeCompare(fullName(b.profile)))
    },
  })
}

// Everyone in the organization with their space memberships (super admin's users page).
export function useOrgUsers() {
  return useQuery({
    queryKey: ['org-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, status, is_super_admin, must_change_password, invited_at, accepted_at, last_login_at, created_at, space_members(space_id, role)')
        .order('first_name')
      if (error) throw error
      return data
    },
  })
}

export function fullName(profile) {
  return profile ? `${profile.first_name} ${profile.last_name}` : 'Deleted user'
}
