import { describe, expect, it } from 'vitest'
import { spaceSchema, userCreateSchema, userEditSchema } from './validation'

const messages = (r) => r.error.issues.map((i) => i.message)
const createBase = { firstName: 'Ann', lastName: 'Lee', email: 'ann@x.co', password: 'secret123', mustChangePassword: true }
const editBase = { ...createBase, password: '', enabled: true }

describe('userCreateSchema', () => {
  it('accepts valid input and defaults access to {}', () => {
    const r = userCreateSchema.safeParse(createBase)
    expect(r.success).toBe(true)
    expect(r.data.access).toEqual({})
  })
  it('trims names and email', () => {
    const r = userCreateSchema.safeParse({ ...createBase, firstName: ' Ann ', email: ' ann@x.co ' })
    expect(r.data).toMatchObject({ firstName: 'Ann', email: 'ann@x.co' })
  })
  it('requires names, email and a strong password', () => {
    const r = userCreateSchema.safeParse({ ...createBase, firstName: '', lastName: '', email: '', password: '' })
    expect(messages(r)).toEqual(expect.arrayContaining(['First name is required', 'Last name is required', 'Email is required']))
  })
  it.each([
    ['short1', 'at least 8'],
    ['abcdefgh', 'letter' ],
    ['12345678', 'letter'],
  ])('rejects weak password %s', (password, text) => {
    const r = userCreateSchema.safeParse({ ...createBase, password })
    expect(r.success).toBe(false)
    expect(messages(r).join()).toMatch(text === 'letter' && password === 'abcdefgh' ? /number/ : new RegExp(text))
  })
  it('validates access roles', () => {
    expect(userCreateSchema.safeParse({ ...createBase, access: { s1: 'editor', s2: '' } }).success).toBe(true)
    expect(userCreateSchema.safeParse({ ...createBase, access: { s1: 'owner' } }).success).toBe(false)
  })
})

describe('userEditSchema', () => {
  it('allows an empty password', () => {
    expect(userEditSchema.safeParse(editBase).success).toBe(true)
  })
  it('accepts a strong new password and rejects a weak one', () => {
    expect(userEditSchema.safeParse({ ...editBase, password: 'newpass123' }).success).toBe(true)
    expect(userEditSchema.safeParse({ ...editBase, password: 'weak' }).success).toBe(false)
  })
  it('requires enabled boolean and valid email', () => {
    expect(userEditSchema.safeParse({ ...editBase, enabled: undefined }).success).toBe(false)
    expect(messages(userEditSchema.safeParse({ ...editBase, email: 'bad' }))).toContain('Enter a valid email address')
  })
})

describe('spaceSchema', () => {
  const ok = { name: 'Home', description: '', currencyCode: 'BDT' }
  it('accepts valid input and defaults description', () => {
    expect(spaceSchema.safeParse(ok).success).toBe(true)
    expect(spaceSchema.parse({ name: 'Home', currencyCode: 'USD' }).description).toBe('')
  })
  it('requires a name, max 100', () => {
    expect(messages(spaceSchema.safeParse({ ...ok, name: '  ' }))).toContain('Space name is required')
    expect(spaceSchema.safeParse({ ...ok, name: 'a'.repeat(101) }).success).toBe(false)
  })
  it('limits description to 500', () => {
    expect(spaceSchema.safeParse({ ...ok, description: 'a'.repeat(501) }).success).toBe(false)
  })
  it('requires a 3-letter uppercase currency', () => {
    expect(messages(spaceSchema.safeParse({ ...ok, currencyCode: '' }))).toContain('Choose a currency')
    expect(spaceSchema.safeParse({ ...ok, currencyCode: 'usd' }).success).toBe(false)
  })
})
