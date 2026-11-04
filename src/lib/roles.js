export const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer', super_admin: 'Super admin' }

export const ROLE_DESCRIPTIONS = {
  viewer: 'Can view entries and the dashboard',
  editor: 'Can add, edit and delete entries',
  admin: 'Editor, plus folders, files and categories',
}

// The current user's role in a space that was loaded with its space_members.
export function roleInSpace(profile, space) {
  if (profile.is_super_admin) return 'super_admin'
  return space.space_members?.find((m) => m.user_id === profile.id)?.role ?? null
}

const RANK = { viewer: 1, editor: 2, admin: 3, super_admin: 4 }

// True if `role` is at least `minRole` (mirrors private.has_space_role in the database).
export function hasRole(role, minRole) {
  return (RANK[role] ?? 0) >= (RANK[minRole] ?? Infinity)
}
