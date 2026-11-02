import { ORG_C, TEST_PASSWORD } from '../fixtures/ids.js'
import { expect, login, fillLogin, signOut } from './helpers.js'

export const SPACE_IDS = ORG_C.spaces

export function uniq() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}

export async function loginAs(page, user) {
  await login(page, user, TEST_PASSWORD)
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 15_000 })
}

export async function gotoUsers(page) {
  await page.goto('/settings/users')
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /Cara Chief/ })).toBeVisible()
}

export function userRow(page, name) {
  return page.getByRole('row', { name })
}

// Opens the Add user modal, fills it in and submits. access: { office?: role, projects?: role }.
// Returns { email, password, first, last, name }.
export async function addUser(page, { access = {}, mustChange = true } = {}) {
  const id = uniq()
  const first = 'Nova'
  const last = `T${id}`
  const email = `nova.${id}@e2e.hisab-nikash.test`
  await page.getByRole('button', { name: 'Add user' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('First name').fill(first)
  await dialog.getByLabel('Last name').fill(last)
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByRole('button', { name: 'Generate password' }).click()
  const password = await dialog.getByLabel('Password', { exact: true }).inputValue()
  expect(password.length).toBeGreaterThanOrEqual(8)
  if (access.office) await dialog.getByLabel(ORG_C.spaces.office.name, { exact: true }).selectOption(access.office)
  if (access.projects) await dialog.getByLabel(ORG_C.spaces.projects.name, { exact: true }).selectOption(access.projects)
  if (!mustChange) await dialog.getByLabel('Require a new password at first sign-in').uncheck()
  await dialog.getByRole('button', { name: 'Add user' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
  const name = `${first} ${last}`
  await expect(userRow(page, name)).toBeVisible()
  return { email, password, first, last, name }
}

export async function expectInviteNotice(page) {
  await expect(page.getByText(/an invitation was sent to|invitation email could not be sent/)).toBeVisible()
}

export async function noHorizontalScroll(page) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
}

export { fillLogin, signOut }
