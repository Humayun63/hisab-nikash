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
