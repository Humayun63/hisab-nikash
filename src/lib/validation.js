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
