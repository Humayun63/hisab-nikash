import { ORG_C, TEST_PASSWORD } from '../fixtures/ids.js'
import { test, expect, fillLogin, signOut, NEW_PASSWORD } from './helpers.js'
import { addUser, expectInviteNotice, gotoUsers, loginAs, noHorizontalScroll, uniq, userRow } from './management-helpers.js'

const { office, projects } = ORG_C.spaces

async function setNewPassword(page, password) {
  await expect(page).toHaveURL(/\/change-password$/)
  await page.getByLabel('New password', { exact: true }).fill(password)
  await page.getByLabel('Confirm new password').fill(password)
  await page.getByRole('button', { name: 'Set password and continue' }).click()
  await expect(page).toHaveURL(/localhost:5173\/$/)
}

// Tests in this file run in order in one worker (they share Org C).

test.describe('access control (editor)', () => {
  test('editor sees no admin links, is redirected from admin pages, and uses the space switcher', async ({ page }) => {
    await loginAs(page, ORG_C.member)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Spaces' })).toHaveCount(0)

    for (const path of ['/settings/users', '/settings/spaces', `/spaces/${office.id}/settings`]) {
      await page.goto(path)
      await expect(page).toHaveURL(/localhost:5173\/$/)
      await expect(page.getByRole('heading', { name: 'Welcome, Max' })).toBeVisible()
    }

    const cards = page.getByRole('region', { name: 'Your spaces' }).or(page.locator('#spaces-heading + *, section ul'))
    await expect(page.getByRole('link', { name: /C Office/ })).toContainText('Editor')
    await expect(page.getByRole('link', { name: /C Projects/ })).toHaveCount(0)
    await expect(cards.first()).toBeVisible()

    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'C Office' })
    await expect(page).toHaveURL(new RegExp(`/spaces/${office.id}$`))
    await expect(page.getByRole('heading', { name: 'C Office' })).toBeVisible()
    await expect(page.getByText('Your role: Editor')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Space settings' })).toHaveCount(0)
  })
})

test.describe('users page', () => {
  test('lists the organization users', async ({ page }) => {
    await loginAs(page, ORG_C.superAdmin)
    await page.getByRole('link', { name: 'Users', exact: true }).click()
    await gotoUsers(page)

    const cara = userRow(page, /Cara Chief/)
    await expect(cara).toContainText('(you)')
    await expect(cara).toContainText('Super admin')
    await expect(cara.getByRole('button', { name: /Delete/ })).toHaveCount(0)
    await expect(cara.getByRole('button', { name: 'Edit Cara Chief' })).toBeVisible()

    const max = userRow(page, /Max Member/)
    await expect(max).toContainText('Active')
    await expect(max).toContainText('C Office · Editor')
    await expect(max.getByRole('button', { name: 'Delete Max Member' })).toBeVisible()

    await expect(userRow(page, /Dora/)).toContainText(ORG_C.toggle.email)
  })

  test('space switcher lists Org C spaces only; All spaces goes home', async ({ page }) => {
    await loginAs(page, ORG_C.superAdmin)
    await expect(page.getByLabel('Space', { exact: true }).locator('option')).toHaveCount(3)
    const options = await page.getByLabel('Space', { exact: true }).locator('option').allTextContents()
    expect(options[0]).toBe('All spaces')
    expect(options).toEqual(expect.arrayContaining(['C Office', 'C Projects']))
    expect(options).not.toContain('Secret')
    expect(options).not.toContain('D Space')
    expect(options).not.toContain('Office')

    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'C Projects' })
    await expect(page).toHaveURL(new RegExp(`/spaces/${projects.id}$`))
    await expect(page.getByText('Your role: Super admin')).toBeVisible()
    await page.getByLabel('Space', { exact: true }).selectOption({ label: 'All spaces' })
    await expect(page).toHaveURL(/localhost:5173\/$/)
    await expect(page.getByRole('heading', { name: 'Welcome, Cara' })).toBeVisible()
  })
})

test.describe('create user', () => {
  test('validation, generate password, create, first sign-in, duplicate email', async ({ page }) => {
    await loginAs(page, ORG_C.superAdmin)
    await gotoUsers(page)

    await page.getByRole('button', { name: 'Add user' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Add user' }).click()
    await expect(dialog.getByText('First name is required')).toBeVisible()
    await expect(dialog.getByText('Last name is required')).toBeVisible()
    await expect(dialog.getByText('Email is required')).toBeVisible()
    await expect(dialog.getByText('Password must be at least 8 characters')).toBeVisible()

    await dialog.getByLabel('Password', { exact: true }).fill('abcdefgh')
    await dialog.getByRole('button', { name: 'Add user' }).click()
    await expect(dialog.getByText('Password must contain a number')).toBeVisible()
    await dialog.getByLabel('Email').fill('not-an-email')
    await dialog.getByRole('button', { name: 'Add user' }).click()
    await expect(dialog.getByText('Enter a valid email address')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    const u = await addUser(page, { access: { office: 'viewer', projects: 'editor' } })
    await expectInviteNotice(page)
    const row = userRow(page, u.name)
    await expect(row).toContainText('Invited')
    await expect(row).toContainText('C Office · Viewer')
    await expect(row).toContainText('C Projects · Editor')

    // Duplicate email
    await page.getByRole('button', { name: 'Add user' }).click()
    await dialog.getByLabel('First name').fill('Dup')
    await dialog.getByLabel('Last name').fill('Licate')
    await dialog.getByLabel('Email').fill(u.email)
    await dialog.getByLabel('Password', { exact: true }).fill('Dup-Pass-12345')
    await dialog.getByRole('button', { name: 'Add user' }).click()
    await expect(dialog.getByRole('alert')).toContainText('A user with this email already exists')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // First sign-in
    await signOut(page)
    await fillLogin(page, u.email, u.password)
    await setNewPassword(page, NEW_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Welcome, Nova' })).toBeVisible()
    await expect(page.getByRole('link', { name: /C Office/ })).toContainText('Viewer')
    await expect(page.getByRole('link', { name: /C Projects/ })).toContainText('Editor')
    await signOut(page)

    await loginAs(page, ORG_C.superAdmin)
    await gotoUsers(page)
    await expect(userRow(page, u.name)).toContainText('Active')
  })
})

test.describe('edit user', () => {
  test('rename Dora, grant admin, disable, sign in blocked, re-enable', async ({ page }) => {
    await loginAs(page, ORG_C.superAdmin)
    await gotoUsers(page)
    const dialog = page.getByRole('dialog')

    await page.getByRole('button', { name: 'Edit Dora Toggle' }).click()
    await dialog.getByLabel('First name').fill('Dorothea')
    await dialog.getByLabel('C Projects', { exact: true }).selectOption('admin')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(page.getByText('Saved changes to Dorothea Toggle.')).toBeVisible()
    const row = userRow(page, /Dorothea Toggle/)
    await expect(row).toContainText('C Projects · Admin')
    await expect(row).toContainText('Active')

    // Disable
    await page.getByRole('button', { name: 'Edit Dorothea Toggle' }).click()
    await dialog.getByLabel('Account enabled').uncheck()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(userRow(page, /Dorothea Toggle/)).toContainText('Disabled')

    await signOut(page)
    await fillLogin(page, ORG_C.toggle.email, TEST_PASSWORD)
    await expect(page.getByText(/Your account has been disabled/)).toBeVisible()
    if (/account-disabled/.test(page.url())) await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    // Re-enable
    await loginAs(page, ORG_C.superAdmin)
    await gotoUsers(page)
    await page.getByRole('button', { name: 'Edit Dorothea Toggle' }).click()
    await expect(dialog.getByLabel('Account enabled')).not.toBeChecked()
    await dialog.getByLabel('Account enabled').check()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(userRow(page, /Dorothea Toggle/)).toContainText('Active')

    await signOut(page)
    await fillLogin(page, ORG_C.toggle.email, TEST_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Welcome, Dorothea' })).toBeVisible()
    await expect(page).toHaveURL(/localhost:5173\/$/)
  })

  test('setting a new password requires a change at next sign-in', async ({ page }) => {
    await loginAs(page, ORG_C.superAdmin)
    await gotoUsers(page)
    const u = await addUser(page, { mustChange: false })
    const dialog = page.getByRole('dialog')

    await page.getByRole('button', { name: `Edit ${u.name}` }).click()
    await expect(dialog.getByLabel('Require a new password at first sign-in')).toHaveCount(0)
    const adminSet = 'Admin-Set-Pass-3!'
    await dialog.getByLabel('New password', { exact: true }).fill(adminSet)
    await expect(dialog.getByLabel('Require a new password at first sign-in')).toBeChecked()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    await signOut(page)
    await fillLogin(page, u.email, u.password)
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
    await fillLogin(page, u.email, adminSet)
    await setNewPassword(page, NEW_PASSWORD)
    await expect(page.getByRole('heading', { name: 'Welcome, Nova' })).toBeVisible()
  })
})

test.describe('delete user', () => {
  test('deleted user disappears and cannot sign in', async ({ page }) => {
    await loginAs(page, ORG_C.superAdmin)
    await gotoUsers(page)
    const u = await addUser(page, { access: { office: 'viewer' }, mustChange: false })

    await page.getByRole('button', { name: `Delete ${u.name}` }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: `Delete ${u.name}?` })).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete user' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(userRow(page, u.name)).toHaveCount(0)
    await expect(page.getByText(`${u.name} was deleted.`)).toBeVisible()

    await signOut(page)
    await fillLogin(page, u.email, u.password)
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('spaces', () => {
  test('create, rename, members, duplicate name, delete', async ({ page }) => {
    const id = uniq()
    const name = `E2E Space ${id}`
    const renamed = `${name} R`
    await loginAs(page, ORG_C.superAdmin)
    await page.getByRole('link', { name: 'Spaces', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Spaces', exact: true })).toBeVisible()

    // Create
    await page.getByRole('button', { name: 'New space' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Create space' }).click()
    await expect(dialog.getByText('Space name is required')).toBeVisible()
    await dialog.getByLabel('Space name').fill(name)
    await dialog.getByLabel('Currency').selectOption('EUR')
    await dialog.getByRole('button', { name: 'Create space' }).click()
    await expect(page).toHaveURL(/\/spaces\/[0-9a-f-]+\/settings$/)
    await expect(page.getByRole('heading', { name: `${name} settings` })).toBeVisible()
    await expect(page.getByLabel('Currency')).toHaveValue('EUR')

    // Rename + description
    await page.getByLabel('Space name').fill(renamed)
    await page.getByLabel('Description (optional)').fill('Created by e2e')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Space details saved.')).toBeVisible()
    await expect(page.getByRole('heading', { name: `${renamed} settings` })).toBeVisible()

    // Members
    const members = page.getByRole('region', { name: 'Members' })
    await expect(members.getByText('No members yet')).toBeVisible()
    await members.getByLabel('Add a member').selectOption(ORG_C.member.id)
    await members.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(members.getByText('Max Member added as Viewer.')).toBeVisible()
    const roleSelect = members.getByLabel('Role for Max Member')
    await expect(roleSelect).toHaveValue('viewer')
    await roleSelect.selectOption('admin')
    await expect(members.getByText('Max Member is now Admin.')).toBeVisible()
    await expect(roleSelect).toHaveValue('admin')
    await members.getByRole('button', { name: 'Remove Max Member' }).click()
    await dialog.getByRole('button', { name: 'Remove member' }).click()
    await expect(members.getByText(`Max Member was removed from ${renamed}.`)).toBeVisible()
    await expect(members.getByText('No members yet')).toBeVisible()

    // Duplicate name
    await page.goto('/settings/spaces')
    await expect(page.getByRole('main').getByText(renamed)).toBeVisible()
    await page.getByRole('button', { name: 'New space' }).click()
    await dialog.getByLabel('Space name').fill('C Office')
    await dialog.getByRole('button', { name: 'Create space' }).click()
    await expect(dialog.getByRole('alert')).toContainText('A space with this name already exists')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    // Delete
    await page.getByRole('link', { name: `Settings for ${renamed}` }).click()
    await page.getByRole('button', { name: 'Delete this space' }).click()
    const del = dialog.getByRole('button', { name: 'Delete space', exact: true })
    await expect(del).toBeDisabled()
    await dialog.getByLabel(`Type "${renamed}" to confirm`).fill(name)
    await expect(del).toBeDisabled()
    await dialog.getByLabel(`Type "${renamed}" to confirm`).fill(renamed)
    await expect(del).toBeEnabled()
    await del.click()
    await expect(page).toHaveURL(/\/settings\/spaces$/)
    await expect(page.getByRole('heading', { name: 'Spaces', exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByText('C Office', { exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByText(renamed)).toHaveCount(0)
  })
})

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('users and space settings pages fit; Add user modal is usable', async ({ page }) => {
    await loginAs(page, ORG_C.superAdmin)
    await gotoUsers(page)
    await noHorizontalScroll(page)

    await page.getByRole('button', { name: 'Add user' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await noHorizontalScroll(page)
    const box = await dialog.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await dialog.getByLabel('First name').fill('Phone')
    await dialog.getByRole('button', { name: 'Generate password' }).click()
    await expect(dialog.getByLabel('Password', { exact: true })).not.toHaveValue('')
    await expect(dialog.getByRole('button', { name: 'Add user' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    await page.goto(`/spaces/${office.id}/settings`)
    await expect(page.getByRole('heading', { name: 'C Office settings' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Members' }).getByText('Max Member').first()).toBeVisible()
    await noHorizontalScroll(page)
  })
})
