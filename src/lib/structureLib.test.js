import { describe, expect, it } from 'vitest'
import { formatMoney } from './format'
import { checkWrite, NO_ROWS_MESSAGE, structureErrorMessage } from './structureErrors'
import { hasRole } from './roles'
import { categorySchema, nameSchema } from './validation'

describe('formatMoney', () => {
  it('formats with the currency code', () => {
    const out = formatMoney(1250, 'USD', '$')
    expect(out).toContain('1,250.00')
    expect(out).toContain('$')
  })
  it('formats negatives and strings', () => {
    expect(formatMoney('-5.5', 'USD', '$')).toMatch(/5\.50/)
    expect(formatMoney('-5.5', 'USD', '$')).toMatch(/-/)
  })
  it('treats null and garbage as zero', () => {
    expect(formatMoney(null, 'USD', '$')).toContain('0.00')
    expect(formatMoney('abc', 'USD', '$')).toContain('0.00')
  })
  it('falls back to the symbol for unknown currency codes', () => {
    expect(formatMoney(1250, 'not-a-code', '৳')).toBe('৳1,250.00')
  })
  it('falls back to an empty symbol when none is given', () => {
    expect(formatMoney(3, 'bad!', undefined)).toBe('3.00')
  })
})

describe('structureErrorMessage', () => {
  it('returns null without an error', () => {
    expect(structureErrorMessage(null)).toBeNull()
  })
  it('explains duplicate names with the thing', () => {
    expect(structureErrorMessage({ code: '23505' }, 'folder')).toBe('A folder with this name already exists.')
    expect(structureErrorMessage({ code: '23505' })).toBe('A item with this name already exists.')
  })
  it('explains categories that still have entries', () => {
    expect(structureErrorMessage({ code: '23503' }, 'category')).toMatch(/still has entries.*Archive it instead/)
  })
  it('uses a generic message for foreign key errors on other things', () => {
    expect(structureErrorMessage({ code: '23503' }, 'file')).toMatch(/Something it depends on no longer exists/)
    expect(structureErrorMessage({ code: '23503' })).toMatch(/Reload the page/)
  })
  it('explains a category type change that is refused', () => {
    expect(structureErrorMessage({ code: '23514', message: 'Cannot change the type of a category with entries' }, 'category')).toBe(
      "This category already has entries, so its type can't be changed.",
    )
  })
  it('does not remap other check violations', () => {
    expect(structureErrorMessage({ code: '23514', message: 'something else' })).toBe('something else')
  })
  it('passes through "cannot see" permission messages', () => {
    const message = 'You cannot see this category'
    expect(structureErrorMessage({ code: '42501', message })).toBe(message)
  })
  it('uses a generic message for other permission errors', () => {
    expect(structureErrorMessage({ code: '42501', message: 'rls violation' })).toBe("You don't have permission to do that.")
    expect(structureErrorMessage({ code: '42501' })).toBe("You don't have permission to do that.")
  })
  it('falls back to the error message, then a default', () => {
    expect(structureErrorMessage({ message: 'boom' })).toBe('boom')
    expect(structureErrorMessage({})).toBe('Something went wrong. Please try again.')
  })
})

describe('hasRole', () => {
  it('orders viewer < editor < admin < super_admin', () => {
    expect(hasRole('viewer', 'viewer')).toBe(true)
    expect(hasRole('viewer', 'editor')).toBe(false)
    expect(hasRole('editor', 'viewer')).toBe(true)
    expect(hasRole('editor', 'admin')).toBe(false)
    expect(hasRole('admin', 'admin')).toBe(true)
    expect(hasRole('admin', 'super_admin')).toBe(false)
    expect(hasRole('super_admin', 'admin')).toBe(true)
  })
  it('denies a missing or unknown role', () => {
    expect(hasRole(null, 'viewer')).toBe(false)
    expect(hasRole(undefined, 'viewer')).toBe(false)
    expect(hasRole('bogus', 'viewer')).toBe(false)
  })
  it('denies when the minimum role is unknown', () => {
    expect(hasRole('super_admin', 'bogus')).toBe(false)
  })
})

describe('nameSchema', () => {
  it('trims the name', () => {
    expect(nameSchema.parse({ name: '  Rent  ' })).toEqual({ name: 'Rent' })
  })
  it('rejects empty and whitespace-only names', () => {
    expect(nameSchema.safeParse({ name: '' }).error.issues[0].message).toBe('Name is required')
    expect(nameSchema.safeParse({ name: '   ' }).success).toBe(false)
  })
  it('allows 100 characters but not 101', () => {
    expect(nameSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
    expect(nameSchema.safeParse({ name: 'a'.repeat(101) }).error.issues[0].message).toBe('Must be 100 characters or fewer')
  })
})

describe('categorySchema', () => {
  const ok = { name: 'Food', type: 'expense', color: '#22c55e' }
  it('accepts a valid category', () => {
    expect(categorySchema.parse(ok)).toEqual(ok)
    expect(categorySchema.safeParse({ ...ok, type: 'income', color: '#ABCDEF' }).success).toBe(true)
  })
  it('requires a name of at most 60 characters', () => {
    expect(categorySchema.safeParse({ ...ok, name: ' ' }).success).toBe(false)
    expect(categorySchema.safeParse({ ...ok, name: 'a'.repeat(60) }).success).toBe(true)
    expect(categorySchema.safeParse({ ...ok, name: 'a'.repeat(61) }).error.issues[0].message).toBe('Must be 60 characters or fewer')
  })
  it('only allows income or expense', () => {
    expect(categorySchema.safeParse({ ...ok, type: 'transfer' }).success).toBe(false)
    expect(categorySchema.safeParse({ ...ok, type: undefined }).success).toBe(false)
  })
  it('requires a 6-digit hex color', () => {
    for (const color of ['', 'red', '#fff', '22c55e', '#22c55g', '#22c55e0']) {
      expect(categorySchema.safeParse({ ...ok, color }).error.issues[0].message).toBe('Choose a color')
    }
  })
})

describe('checkWrite', () => {
  it('returns the data of a successful write', async () => {
    await expect(checkWrite(Promise.resolve({ data: [{ id: 'a' }], error: null }), 'file')).resolves.toEqual([{ id: 'a' }])
  })
  it('allows null data (insert without select)', async () => {
    await expect(checkWrite(Promise.resolve({ data: null, error: null }), 'file')).resolves.toBeNull()
  })
  it('allows a single-object result', async () => {
    await expect(checkWrite(Promise.resolve({ data: { id: 'a' }, error: null }), 'file')).resolves.toEqual({ id: 'a' })
  })
  it('throws the mapped message for a database error', async () => {
    await expect(checkWrite(Promise.resolve({ data: null, error: { code: '23505' } }), 'folder')).rejects.toThrow(
      'A folder with this name already exists.',
    )
  })
  it('throws NO_ROWS_MESSAGE when nothing was changed', async () => {
    await expect(checkWrite(Promise.resolve({ data: [], error: null }), 'file')).rejects.toThrow(NO_ROWS_MESSAGE)
  })
  it('prefers the error over empty data', async () => {
    await expect(checkWrite(Promise.resolve({ data: [], error: { code: '42501' } }), 'file')).rejects.toThrow(
      "You don't have permission to do that.",
    )
  })
})
