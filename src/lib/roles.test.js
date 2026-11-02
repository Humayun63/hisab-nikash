import { describe, expect, it } from 'vitest'
import { roleInSpace } from './roles'

const space = { space_members: [{ user_id: 'u1', role: 'editor' }, { user_id: 'u2', role: 'admin' }] }

describe('roleInSpace', () => {
  it('super admin is always super_admin', () => {
    expect(roleInSpace({ id: 'x', is_super_admin: true }, space)).toBe('super_admin')
  })
  it('returns the member role', () => {
    expect(roleInSpace({ id: 'u1' }, space)).toBe('editor')
    expect(roleInSpace({ id: 'u2' }, space)).toBe('admin')
  })
  it('returns null for non-members or spaces without members loaded', () => {
    expect(roleInSpace({ id: 'u3' }, space)).toBeNull()
    expect(roleInSpace({ id: 'u1' }, {})).toBeNull()
  })
})
