import { USERS, TEST_PASSWORD } from '../fixtures/ids.js'
import { signIn as apiSignIn } from '../support/db.js'
import { test, expect, fillLogin, login, signOut, jsonResponse, NEW_PASSWORD } from './helpers.js'

const fakeUser = (email) => ({
  id: 'c0000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: '',
  email,
  phone: '',
  confirmation_sent_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
})

const rateLimit = {
  code: 429,
  error_code: 'over_email_send_rate_limit',
  msg: 'email rate limit exceeded',
}

test.describe('routing', () => {
  test('signed-out "/" redirects to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('unknown route shows Page not found', async ({ page }) => {
    await page.goto('/no/such/page')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible()
  })

  test('signed-in user visiting /login is redirected home', async ({ page }) => {
    await login(page, USERS.superAdmin, TEST_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Welcome, Sara' })).toBeVisible()
    await page.goto('/login')
    await expect(page).toHaveURL(/localhost:5173\/$/)
    await expect(page.getByRole('heading', { name: 'Welcome, Sara' })).toBeVisible()
  })
})

test.describe('login', () => {
  test('wrong password shows the error and the resend control', async ({ page }) => {
    await login(page, USERS.superAdmin, 'Wrong-Password-9')
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
    await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('empty login shows validation errors', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Email is required')).toBeVisible()
    await expect(page.getByText('Password is required')).toBeVisible()
  })

  test('super admin signs in, sees home, survives reload, signs out', async ({ page }) => {
    await login(page, USERS.superAdmin, TEST_PASSWORD)
    await expect(page).toHaveURL(/localhost:5173\/$/)
    await expect(page.getByRole('heading', { name: 'Welcome, Sara' })).toBeVisible()
    await expect(page.getByText('E2E Org A').first()).toBeVisible()
    const main = page.getByRole('main')
    await expect(main.getByText('Office', { exact: true })).toBeVisible()
    await expect(main.getByText('Secret', { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Welcome, Sara' })).toBeVisible()
    await expect(page).toHaveURL(/localhost:5173\/$/)

    await signOut(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('register', () => {
  test('client-side validation, no network call', async ({ page }) => {
    let calls = 0
    await page.route('**/auth/v1/signup**', (route) => {
      calls++
      return route.abort()
    })
    await page.goto('/register')
    const submit = page.getByRole('button', { name: 'Create account' })

    await submit.click()
    await expect(page.getByText('First name is required')).toBeVisible()
    await expect(page.getByText('Last name is required')).toBeVisible()
    await expect(page.getByText('Email is required')).toBeVisible()
    await expect(page.getByText('Confirm your password').or(page.getByText('Please confirm your password'))).toBeVisible()

    await page.getByLabel('First name').fill('Zed')
    await page.getByLabel('Last name').fill('Zane')
    await page.getByLabel('Email').fill('not-an-email')
    await submit.click()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()

    await page.getByLabel('Email').fill('zed@example.com')
    await page.getByLabel('Password', { exact: true }).fill('short1')
    await submit.click()
    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible()

    await page.getByLabel('Password', { exact: true }).fill('nonumberhere')
    await submit.click()
    await expect(page.getByText('Password must contain a number')).toBeVisible()

    await page.getByLabel('Password', { exact: true }).fill('Valid-Pass-1')
    await page.getByLabel('Confirm password').fill('Different-Pass-1')
    await submit.click()
    await expect(page.getByText('Passwords do not match')).toBeVisible()

    expect(calls).toBe(0)
    await expect(page).toHaveURL(/\/register$/)
  })

  test('mocked sign-up goes to /verify-email, resend works with cooldown', async ({ page }) => {
    const email = 'zed.new@example.com'
    let signup
    let resend
    await page.route('**/auth/v1/signup**', (route) => {
      const req = route.request()
      signup = { url: new URL(req.url()), body: req.postDataJSON() }
      return route.fulfill(jsonResponse(200, fakeUser(email)))
    })
    await page.route('**/auth/v1/resend**', (route) => {
      const req = route.request()
      resend = { url: new URL(req.url()), body: req.postDataJSON() }
      return route.fulfill(jsonResponse(200, {}))
    })

    await page.goto('/register')
    await page.getByLabel('First name').fill('Zed')
    await page.getByLabel('Last name').fill('Zane')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('Valid-Pass-1')
    await page.getByLabel('Confirm password').fill('Valid-Pass-1')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL(/\/verify-email$/)
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()

    expect(signup.body).toMatchObject({
      email,
      password: 'Valid-Pass-1',
      data: { first_name: 'Zed', last_name: 'Zane' },
    })
    expect(signup.url.searchParams.get('redirect_to')).toBe('http://localhost:5173/auth/callback')

    await page.getByRole('button', { name: 'Resend verification email' }).click()
    await expect(page.getByRole('status')).toContainText(`Verification email sent to ${email}`)
    const cooldown = page.getByRole('button', { name: /Resend available in \d+s/ })
    await expect(cooldown).toBeDisabled()
    expect(resend.body).toMatchObject({ type: 'signup', email })
    expect(resend.url.searchParams.get('redirect_to')).toBe('http://localhost:5173/auth/callback')
  })

  test('sign-up rate limit shows a friendly message', async ({ page }) => {
    await page.route('**/auth/v1/signup**', (route) => route.fulfill(jsonResponse(429, rateLimit)))
    await page.goto('/register')
    await page.getByLabel('First name').fill('Zed')
    await page.getByLabel('Last name').fill('Zane')
    await page.getByLabel('Email').fill('zed.rl@example.com')
    await page.getByLabel('Password', { exact: true }).fill('Valid-Pass-1')
    await page.getByLabel('Confirm password').fill('Valid-Pass-1')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText('Too many emails sent')
    await expect(page).toHaveURL(/\/register$/)
  })

  test('/verify-email without state redirects to /login', async ({ page }) => {
    await page.goto('/verify-email')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('resend error response shows a message', async ({ page }) => {
    await page.route('**/auth/v1/signup**', (route) => route.fulfill(jsonResponse(200, fakeUser('r@example.com'))))
    await page.route('**/auth/v1/resend**', (route) => route.fulfill(jsonResponse(429, rateLimit)))
    await page.goto('/register')
    await page.getByLabel('First name').fill('Zed')
    await page.getByLabel('Last name').fill('Zane')
    await page.getByLabel('Email').fill('r@example.com')
    await page.getByLabel('Password', { exact: true }).fill('Valid-Pass-1')
    await page.getByLabel('Confirm password').fill('Valid-Pass-1')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('button', { name: 'Resend verification email' }).click()
    await expect(page.getByRole('alert')).toContainText('Too many emails sent')
    await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeEnabled()
  })
})

test.describe('email callback', () => {
  test('expired link shows Verification failed', async ({ page }) => {
    await page.goto('/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    await expect(page.getByRole('heading', { name: 'Verification failed' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('This link has expired. Please request a new one.')
    await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible()
  })

  test('callback with nothing shows Link not valid', async ({ page }) => {
    await page.goto('/auth/callback')
    await expect(page.getByRole('heading', { name: 'Link not valid' })).toBeVisible()
    await expect(page.getByText('invalid or has already been used')).toBeVisible()
  })
})

test.describe('setup', () => {
  test('new owner creates organization and first space', async ({ page }) => {
    await login(page, USERS.uiOwner, TEST_PASSWORD)
    await expect(page).toHaveURL(/\/setup$/)
    await expect(page.getByRole('heading', { name: 'Set up your organization' })).toBeVisible()

    await expect(page.getByLabel('Organization name')).toHaveValue("Uma's Organization")
    await expect(page.getByLabel('Week starts on')).toHaveValue('6')
    await expect(page.getByRole('combobox', { name: 'Week starts on' }).locator('option:checked')).toHaveText('Saturday')
    await expect(page.getByLabel('Currency')).toHaveValue('BDT')
    await expect(page.getByLabel('Space name')).toHaveValue('General')

    await page.getByLabel('Organization name').fill('Umas UI Org')
    await page.getByLabel('Space name').fill('Household')
    await page.getByLabel('Currency').selectOption('USD')
    await page.getByRole('button', { name: 'Create organization' }).click()

    await expect(page).toHaveURL(/localhost:5173\/$/)
    await expect(page.getByRole('heading', { name: 'Welcome, Uma' })).toBeVisible()
    await expect(page.getByText('Umas UI Org').first()).toBeVisible()
    await expect(page.getByRole('main').getByText('Household', { exact: true })).toBeVisible()
    await expect(page.getByText(/\$ USD/)).toBeVisible()

    await page.goto('/setup')
    await expect(page).toHaveURL(/localhost:5173\/$/)
  })
})

test.describe('forced password change', () => {
  test('must-change user sets a new password', async ({ page }) => {
    await login(page, USERS.mustChange, TEST_PASSWORD)
    await expect(page).toHaveURL(/\/change-password$/)
    await expect(page.getByRole('heading', { name: 'Set your own password' })).toBeVisible()

    const submit = page.getByRole('button', { name: 'Set password and continue' })
    await page.getByLabel('New password', { exact: true }).fill('Valid-Pass-1')
    await page.getByLabel('Confirm new password').fill('Other-Pass-1')
    await submit.click()
    await expect(page.getByText('Passwords do not match')).toBeVisible()

    await page.getByLabel('New password', { exact: true }).fill('weakpass')
    await page.getByLabel('Confirm new password').fill('weakpass')
    await submit.click()
    await expect(page.getByText('Password must contain a number')).toBeVisible()
    await expect(page).toHaveURL(/\/change-password$/)

    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD)
    await submit.click()
    await expect(page).toHaveURL(/localhost:5173\/$/)
    await expect(page.getByRole('heading', { name: 'Welcome, Milo' })).toBeVisible()

    await signOut(page)

    await fillLogin(page, USERS.mustChange.email, NEW_PASSWORD)
    await expect(page).toHaveURL(/localhost:5173\/$/)
    await expect(page.getByRole('heading', { name: 'Welcome, Milo' })).toBeVisible()
    await signOut(page)

    await fillLogin(page, USERS.mustChange.email, TEST_PASSWORD)
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('forgot password', () => {
  test('mocked recover shows Check your email', async ({ page }) => {
    let recover
    await page.route('**/auth/v1/recover**', (route) => {
      const req = route.request()
      recover = { url: new URL(req.url()), body: req.postDataJSON() }
      return route.fulfill(jsonResponse(200, {}))
    })
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('someone@example.com')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByText('someone@example.com')).toBeVisible()
    expect(recover.body).toMatchObject({ email: 'someone@example.com' })
    expect(recover.url.searchParams.get('redirect_to')).toBe('http://localhost:5173/reset-password')
  })

  test('login page links to forgot password', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  })

  test('invalid email is rejected client-side', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('nope')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()
  })

  test('error response shows the message', async ({ page }) => {
    await page.route('**/auth/v1/recover**', (route) => route.fulfill(jsonResponse(429, rateLimit)))
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill('someone@example.com')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('alert')).toContainText('Too many emails sent')
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  })
})

test.describe('reset password page', () => {
  test('signed out shows Link not valid', async ({ page }) => {
    await page.goto('/reset-password')
    await expect(page.getByRole('heading', { name: 'Link not valid' })).toBeVisible()
    await page.getByRole('link', { name: 'Request a new link' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  test('a normally signed-in user visiting /reset-password is sent home', async ({ page }) => {
    await login(page, USERS.superAdmin, TEST_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Welcome, Sara' })).toBeVisible()
    await page.goto('/reset-password')
    await expect(page).toHaveURL(/localhost:5173\/$/)
  })

  test('reset link: user must set a new password, then can sign in with it', async ({ page }) => {
    // Same URL shape Supabase redirects to from the reset email (implicit flow).
    const client = await apiSignIn(USERS.resetter.email)
    const { session } = (await client.auth.getSession()).data
    const hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: String(session.expires_in),
      expires_at: String(session.expires_at),
      token_type: 'bearer',
      type: 'recovery',
    })
    await page.goto(`/reset-password#${hash}`)
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()

    // The recovery session can't be used to enter the app before choosing a password.
    await page.goto('/')
    await expect(page).toHaveURL(/\/reset-password$/)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/reset-password$/)

    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Save new password' }).click()
    await expect(page).toHaveURL(/localhost:5173\/$/)
    await expect(page.getByRole('heading', { name: 'Welcome, Rita' })).toBeVisible()

    await signOut(page)
    await fillLogin(page, USERS.resetter.email, TEST_PASSWORD)
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
    await fillLogin(page, USERS.resetter.email, NEW_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Welcome, Rita' })).toBeVisible()
  })
})

test.describe('disabled account', () => {
  test('disabled user sees the message and can sign out', async ({ page }) => {
    await login(page, USERS.disabled, TEST_PASSWORD)
    await expect(page).toHaveURL(/\/account-disabled$/)
    await expect(page.getByRole('heading', { name: 'Account disabled' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveText('Your account has been disabled. Contact your administrator.')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})
