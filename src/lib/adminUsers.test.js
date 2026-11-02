import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
import { supabase } from './supabaseClient'
import { diffMemberships, generatePassword, invokeAdminUsers } from './adminUsers'

beforeEach(() => vi.clearAllMocks())

describe('invokeAdminUsers', () => {
  it('posts action + payload and returns data on success', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: 1 }, error: null })
    await expect(invokeAdminUsers('delete', { user_id: 'u1' })).resolves.toEqual({ ok: 1 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-users', { body: { action: 'delete', user_id: 'u1' } })
  })
  it('works without a payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null })
    await invokeAdminUsers('create')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-users', { body: { action: 'create' } })
  })
  it('throws the JSON body error and code', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'A user with this email already exists', code: 'email_exists' }) } },
    })
    const err = await invokeAdminUsers('create', {}).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('A user with this email already exists')
    expect(err.code).toBe('email_exists')
  })
  it('falls back to error.message when the body is not JSON', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to send a request', context: { json: async () => { throw new SyntaxError('bad') } } },
    })
    const err = await invokeAdminUsers('create', {}).catch((e) => e)
    expect(err.message).toBe('Failed to send a request')
    expect(err.code).toBeUndefined()
  })
  it('falls back when there is no context at all', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(invokeAdminUsers('create', {})).rejects.toThrow('offline')
  })
  it('keeps error.message when JSON body has no error field', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'orig', context: { json: async () => ({}) } } })
    await expect(invokeAdminUsers('x')).rejects.toThrow('orig')
  })
})

describe('generatePassword', () => {
  it('has the default length of 14 and honours a custom length', () => {
    expect(generatePassword()).toHaveLength(14)
    expect(generatePassword(20)).toHaveLength(20)
  })
  it('always contains a letter and a digit and only allowed characters (200 runs)', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword()
      expect(pw).toMatch(/[A-Za-z]/)
      expect(pw).toMatch(/\d/)
      expect(pw).toMatch(/^[a-hj-km-np-zA-HJ-NP-Z2-9]+$/)
    }
  })
  it('varies between calls', () => {
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBeGreaterThan(1)
  })
})

describe('diffMemberships', () => {
  it('adds, updates and removes', () => {
    const d = diffMemberships({ a: 'viewer', b: 'editor', c: 'admin' }, { a: 'viewer', b: 'admin', d: 'viewer', c: '' })
    expect(d.add).toEqual([{ space_id: 'd', role: 'viewer' }])
    expect(d.update).toEqual([{ space_id: 'b', role: 'admin' }])
    expect(d.remove).toEqual(['c'])
  })
  it('is a no-op when nothing changed, treating "" as no access', () => {
    expect(diffMemberships({ a: 'viewer' }, { a: 'viewer', b: '' })).toEqual({ add: [], update: [], remove: [] })
    expect(diffMemberships({}, {})).toEqual({ add: [], update: [], remove: [] })
  })
  it('removes when desired is missing entirely', () => {
    expect(diffMemberships({ a: 'editor' }, {}).remove).toEqual(['a'])
  })
})
