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
