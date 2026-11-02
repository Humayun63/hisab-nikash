import { describe, expect, it } from 'vitest'
import {
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  registerSchema,
  setupSchema,
} from './validation'

const messages = (result) => (result.success ? [] : result.error.issues.map((i) => i.message))
const paths = (result) => (result.success ? [] : result.error.issues.map((i) => i.path.join('.')))

const validRegister = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'abcdef12',
  confirmPassword: 'abcdef12',
}

describe('registerSchema', () => {
  it('accepts valid input', () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true)
  })

  it('trims names and email', () => {
    const r = registerSchema.safeParse({ ...validRegister, firstName: '  Ada ', email: '  ada@example.com ' })
    expect(r.success).toBe(true)
    expect(r.data.firstName).toBe('Ada')
    expect(r.data.email).toBe('ada@example.com')
  })

  it('requires names (whitespace only counts as empty)', () => {
    const r = registerSchema.safeParse({ ...validRegister, firstName: '   ', lastName: '' })
    expect(messages(r)).toEqual(expect.arrayContaining(['First name is required', 'Last name is required']))
  })

  it('limits names to 50 characters', () => {
    expect(registerSchema.safeParse({ ...validRegister, firstName: 'a'.repeat(50) }).success).toBe(true)
    const r = registerSchema.safeParse({ ...validRegister, lastName: 'a'.repeat(51) })
    expect(messages(r)).toContain('Last name must be 50 characters or fewer')
  })

  it('requires email and validates its format', () => {
    expect(messages(registerSchema.safeParse({ ...validRegister, email: '' }))).toContain('Email is required')
    expect(messages(registerSchema.safeParse({ ...validRegister, email: 'nope' }))).toContain('Enter a valid email address')
  })

  it('enforces password rules', () => {
    const run = (password) =>
      messages(registerSchema.safeParse({ ...validRegister, password, confirmPassword: password }))
    expect(run('abc1')).toContain('Password must be at least 8 characters')
    expect(run('12345678')).toContain('Password must contain a letter')
    expect(run('abcdefgh')).toContain('Password must contain a number')
    expect(run('abcdefg1')).toEqual([])
  })

  it('reports mismatch on confirmPassword path', () => {
    const r = registerSchema.safeParse({ ...validRegister, confirmPassword: 'different1' })
    expect(messages(r)).toContain('Passwords do not match')
    expect(paths(r)).toContain('confirmPassword')
  })

  it('requires confirmation', () => {
    expect(messages(registerSchema.safeParse({ ...validRegister, confirmPassword: '' }))).toContain(
      'Please confirm your password',
    )
  })
})

describe('loginSchema', () => {
  it('accepts valid input and trims email', () => {
    const r = loginSchema.safeParse({ email: ' a@b.co ', password: 'x' })
    expect(r.success).toBe(true)
    expect(r.data.email).toBe('a@b.co')
  })
  it('does not apply password strength rules', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true)
  })
  it('requires password and valid email', () => {
    const r = loginSchema.safeParse({ email: 'bad', password: '' })
    expect(messages(r)).toEqual(expect.arrayContaining(['Enter a valid email address', 'Password is required']))
  })
})

describe('forgotPasswordSchema', () => {
  it('validates email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true)
    expect(messages(forgotPasswordSchema.safeParse({ email: '' }))).toContain('Email is required')
    expect(messages(forgotPasswordSchema.safeParse({ email: 'x' }))).toContain('Enter a valid email address')
  })
})

describe('newPasswordSchema', () => {
  it('accepts matching valid passwords', () => {
    expect(newPasswordSchema.safeParse({ password: 'abcdef12', confirmPassword: 'abcdef12' }).success).toBe(true)
  })
  it('flags mismatch on confirmPassword', () => {
    const r = newPasswordSchema.safeParse({ password: 'abcdef12', confirmPassword: 'abcdef13' })
    expect(messages(r)).toContain('Passwords do not match')
    expect(paths(r)).toContain('confirmPassword')
  })
  it('applies password rules', () => {
    const r = newPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' })
    expect(messages(r)).toContain('Password must be at least 8 characters')
  })
})

describe('setupSchema', () => {
  const valid = { orgName: 'Acme', timezone: 'Asia/Dhaka', weekStart: '6', spaceName: 'General', currencyCode: 'BDT' }

  it('accepts valid input and coerces weekStart from string', () => {
    const r = setupSchema.safeParse(valid)
    expect(r.success).toBe(true)
    expect(r.data.weekStart).toBe(6)
  })
  it('accepts weekStart 0 and rejects out of range / non-integers', () => {
    expect(setupSchema.safeParse({ ...valid, weekStart: '0' }).data.weekStart).toBe(0)
    expect(setupSchema.safeParse({ ...valid, weekStart: '7' }).success).toBe(false)
    expect(setupSchema.safeParse({ ...valid, weekStart: '-1' }).success).toBe(false)
    expect(setupSchema.safeParse({ ...valid, weekStart: '1.5' }).success).toBe(false)
  })
  it('validates org and space names', () => {
    expect(messages(setupSchema.safeParse({ ...valid, orgName: ' ' }))).toContain('Organization name is required')
    expect(messages(setupSchema.safeParse({ ...valid, spaceName: '' }))).toContain('Space name is required')
    expect(messages(setupSchema.safeParse({ ...valid, orgName: 'a'.repeat(101) }))).toContain('Must be 100 characters or fewer')
    expect(setupSchema.safeParse({ ...valid, spaceName: 'a'.repeat(100) }).success).toBe(true)
  })
  it('requires timezone', () => {
    expect(messages(setupSchema.safeParse({ ...valid, timezone: '' }))).toContain('Timezone is required')
  })
  it('requires an uppercase 3-letter currency code', () => {
    for (const bad of ['', 'bdt', 'BD', 'BDTT', 'B1T']) {
      expect(messages(setupSchema.safeParse({ ...valid, currencyCode: bad }))).toContain('Choose a currency')
    }
    expect(setupSchema.safeParse({ ...valid, currencyCode: 'USD' }).success).toBe(true)
  })
})

describe('password length limit', () => {
  it('rejects passwords over 72 characters (bcrypt limit)', async () => {
    const { newPasswordSchema } = await import('./validation')
    const long = `a1${'x'.repeat(71)}`
    const result = newPasswordSchema.safeParse({ password: long, confirmPassword: long })
    expect(result.success).toBe(false)
    expect(result.error.issues[0].message).toMatch(/72/)
  })
})
