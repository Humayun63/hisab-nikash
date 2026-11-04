import { z } from 'zod'

// Mirrors the Supabase Auth password policy (min 8, letters and digits) — supabase/config.toml.
export const PASSWORD_MIN_LENGTH = 8

const email = z.string().trim().min(1, 'Email is required').email('Enter a valid email address')

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(72, 'Password must be 72 characters or fewer') // bcrypt limit in Supabase Auth
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number')

const personName = (label) =>
  z.string().trim().min(1, `${label} is required`).max(50, `${label} must be 50 characters or fewer`)

const withConfirmedPassword = (schema) =>
  schema.refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const registerSchema = withConfirmedPassword(
  z.object({
    firstName: personName('First name'),
    lastName: personName('Last name'),
    email,
    password,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  }),
)

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
})

export const forgotPasswordSchema = z.object({ email })

export const newPasswordSchema = withConfirmedPassword(
  z.object({
    password,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  }),
)

export const setupSchema = z.object({
  orgName: z.string().trim().min(1, 'Organization name is required').max(100, 'Must be 100 characters or fewer'),
  timezone: z.string().min(1, 'Timezone is required'),
  weekStart: z.coerce.number().int().min(0).max(6),
  spaceName: z.string().trim().min(1, 'Space name is required').max(100, 'Must be 100 characters or fewer'),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency'),
})

// For accounts created without a name (e.g. in the Supabase dashboard), setup also asks for it.
export const setupWithNameSchema = setupSchema.extend({
  firstName: personName('First name'),
  lastName: personName('Last name'),
})

// ---------------------------------------------------------------------------
// User and space management (super admin)
// ---------------------------------------------------------------------------
export const ROLES = ['viewer', 'editor', 'admin']

// { [spaceId]: '' | 'viewer' | 'editor' | 'admin' } — '' means no access.
const spaceAccess = z.record(z.string(), z.union([z.literal(''), z.enum(ROLES)])).default({})

export const userCreateSchema = z.object({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  email,
  password,
  mustChangePassword: z.boolean(),
  access: spaceAccess,
})

export const userEditSchema = z.object({
  firstName: personName('First name'),
  lastName: personName('Last name'),
  email,
  password: z.union([z.literal(''), password]),
  mustChangePassword: z.boolean(),
  enabled: z.boolean(),
  access: spaceAccess,
})

export const spaceSchema = z.object({
  name: z.string().trim().min(1, 'Space name is required').max(100, 'Must be 100 characters or fewer'),
  description: z.string().trim().max(500, 'Must be 500 characters or fewer').optional().default(''),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency'),
})

// ---------------------------------------------------------------------------
// Folders, files and categories
// ---------------------------------------------------------------------------
export const nameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Must be 100 characters or fewer'),
})

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60, 'Must be 60 characters or fewer'),
  type: z.enum(['income', 'expense']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a color'),
})

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------
// Largest value numeric(14,2) can hold.
export const MAX_AMOUNT = 999_999_999_999.99

// `today` is "YYYY-MM-DD" in the organization's timezone; entries can't be dated after it.
export function entrySchema(today) {
  return z.object({
    amount: z
      .string()
      .trim()
      .min(1, 'Amount is required')
      .transform((s) => s.replaceAll(',', ''))
      .refine((s) => /^\d+(\.\d{1,2})?$/.test(s), 'Enter an amount like 250 or 99.50 (up to 2 decimals)')
      .refine((s) => Number(s) > 0, 'Amount must be more than 0')
      .refine((s) => Number(s) <= MAX_AMOUNT, 'Amount is too large'),
    categoryId: z.string().min(1, 'Choose a category'),
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
      .refine((d) => d <= today, 'The date can\'t be in the future'),
    note: z.string().trim().max(500, 'Must be 500 characters or fewer'),
  })
}
