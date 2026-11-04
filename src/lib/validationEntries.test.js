import { describe, expect, it } from 'vitest'
import { entrySchema } from './validation'

const TODAY = '2026-11-04'
const schema = entrySchema(TODAY)
const base = { amount: '250', categoryId: 'c1', entryDate: TODAY, note: '' }

const check = (overrides) => schema.safeParse({ ...base, ...overrides })
const messages = (result) => (result.success ? [] : result.error.issues.map((i) => i.message))

describe('entrySchema amount', () => {
  it.each([
    ['250', '250'],
    ['99.5', '99.5'],
    ['1,250.50', '1250.50'],
  ])('accepts %j and normalizes to %j', (input, expected) => {
    const result = check({ amount: input })
    expect(result.success).toBe(true)
    expect(result.data.amount).toBe(expected)
  })

  it.each(['0', '1.234', 'abc'])('rejects %j', (input) => {
    expect(check({ amount: input }).success).toBe(false)
  })

  it('rejects zero with a clear message', () => {
    expect(messages(check({ amount: '0' }))).toContain('Amount must be more than 0')
  })

  it('rejects an amount above the database limit', () => {
    expect(messages(check({ amount: '1000000000000' }))).toContain('Amount is too large')
  })
})

describe('entrySchema date', () => {
  it('accepts today', () => {
    expect(check({ entryDate: TODAY }).success).toBe(true)
  })

  it('rejects a future date', () => {
    expect(messages(check({ entryDate: '2026-11-05' }))).toContain("The date can't be in the future")
  })
})

describe('entrySchema other fields', () => {
  it('accepts a note of 500 characters', () => {
    expect(check({ note: 'x'.repeat(500) }).success).toBe(true)
  })

  it('rejects a note over 500 characters', () => {
    expect(messages(check({ note: 'x'.repeat(501) }))).toContain('Must be 500 characters or fewer')
  })
})
