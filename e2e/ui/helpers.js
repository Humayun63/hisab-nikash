import { test as base, expect } from '@playwright/test'

// Every test fails on uncaught page errors.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    await use(page)
    expect(errors, 'uncaught page errors').toEqual([])
  },
})
export { expect }

export async function fillLogin(page, email, password) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

export async function login(page, user, password) {
  await page.goto('/login')
  await fillLogin(page, user.email, password)
}

export async function signOut(page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

export function jsonResponse(status, body) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

export const NEW_PASSWORD = 'Brand-New-Pass-2!'
