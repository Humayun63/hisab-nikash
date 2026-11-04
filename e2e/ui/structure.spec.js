import { ORG_E } from '../fixtures/ids.js'
import { test, expect } from './helpers.js'
import { loginAs, noHorizontalScroll, uniq } from './management-helpers.js'

// Milestone 4 UI tests: folders, files and categories in "E Office" (Org E).
// Tests run in order in one worker. Mutating tests only touch things they create themselves,
// except where noted, and always restore what they change. Daily Costs, Payroll and the
// Rent/Sales/Private categories are never modified.
const office = ORG_E.office
const { daily, payroll, website } = office.files
const base = `/spaces/${office.id}`

const sidebar = (page) => page.getByRole('complementary', { name: `${office.name} navigation` })
const dialog = (page) => page.getByRole('dialog')
const row = (page, name) => page.getByRole('listitem', { name, exact: true })

async function gotoDashboard(page) {
  await page.goto(base)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(sidebar(page).getByRole('link', { name: /Daily Costs/ })).toBeVisible()
}

async function gotoCategories(page) {
  await page.goto(`${base}/categories`)
  await expect(page.getByRole('heading', { name: 'Categories', exact: true })).toBeVisible()
  await expect(row(page, 'Rent')).toBeVisible()
}

async function expectTotals(page, { income, expense, net }) {
  const totals = page.getByLabel('File totals')
  await expect(totals).toContainText(new RegExp(`Income\\D*${income}`))
  await expect(totals).toContainText(new RegExp(`Expense\\D*${expense}`))
  await expect(totals).toContainText(new RegExp(`Net\\D*${net}`))
}

test.describe('read-only members (viewer, editor)', () => {
  for (const [key, label] of [['viewer', 'viewer'], ['editor', 'editor']]) {
    test(`${label} sees the tree and totals but no management controls`, async ({ page }) => {
      await loginAs(page, ORG_E[key])
      await gotoDashboard(page)
      const side = sidebar(page)

      await expect(side.getByRole('link', { name: 'Dashboard' })).toBeVisible()
      await expect(side.getByRole('link', { name: 'Categories' })).toHaveCount(0)
      await expect(side.getByRole('link', { name: 'Settings' })).toHaveCount(0)

      for (const f of ['Operations', 'Projects', 'Empty Folder']) {
        await expect(side.getByRole('button', { name: f, exact: true })).toBeVisible()
      }
      await expect(side.getByRole('link', { name: /Daily Costs/ })).toContainText(/3,800\.00/)
      await expect(side.getByRole('link', { name: /Payroll/ })).toContainText(/1,000\.00/)

      await expect(side.getByRole('button', { name: 'New folder' })).toHaveCount(0)
      await expect(side.getByRole('button', { name: /^New file in/ })).toHaveCount(0)
      await expect(side.getByRole('button', { name: /^Rename folder/ })).toHaveCount(0)
      await expect(side.getByRole('button', { name: /^Delete folder/ })).toHaveCount(0)

      await side.getByRole('link', { name: /Payroll/ }).click()
      await expect(page.getByRole('heading', { name: 'Payroll' })).toBeVisible()
      await expectTotals(page, { income: '1,000\\.00', expense: '0\\.00', net: '1,000\\.00' })
      await expect(page.getByRole('button', { name: 'Rename file' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Delete file' })).toHaveCount(0)

      await page.goto(`${base}/categories`)
      await expect(page).toHaveURL(new RegExp(`${base}/dashboard$`))
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    })
  }
})

test.describe('restricted category visibility in totals', () => {
  test('viewer without access does not see the Private expense', async ({ page }) => {
    await loginAs(page, ORG_E.viewer)
    await page.goto(`${base}/files/${daily.id}`)
    await expect(page.getByRole('heading', { name: 'Daily Costs' })).toBeVisible()
    await expectTotals(page, { income: '5,000\\.00', expense: '1,200\\.00', net: '3,800\\.00' })
    await expect(page.getByText(/^2 entries/)).toBeVisible()
    await expect(sidebar(page).getByRole('link', { name: /Daily Costs/ })).toContainText(/3,800\.00/)
  })

  test('granted viewer sees the Private expense included', async ({ page }) => {
    await loginAs(page, ORG_E.granted)
    await page.goto(`${base}/files/${daily.id}`)
    await expect(page.getByRole('heading', { name: 'Daily Costs' })).toBeVisible()
    await expectTotals(page, { income: '5,000\\.00', expense: '1,500\\.00', net: '3,500\\.00' })
    await expect(page.getByText(/^3 entries/)).toBeVisible()
    await expect(sidebar(page).getByRole('link', { name: /Daily Costs/ })).toContainText(/3,500\.00/)
  })

  test('super admin sees the Private expense included and the Settings link', async ({ page }) => {
    await loginAs(page, ORG_E.superAdmin)
    await page.goto(`${base}/files/${daily.id}`)
    await expect(page.getByRole('heading', { name: 'Daily Costs' })).toBeVisible()
    await expectTotals(page, { income: '5,000\\.00', expense: '1,500\\.00', net: '3,500\\.00' })
    const side = sidebar(page)
    await expect(side.getByRole('link', { name: 'Settings' })).toBeVisible()
    await expect(side.getByRole('link', { name: 'Categories' })).toBeVisible()
    await expect(side).toContainText('Super admin')
    await side.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(new RegExp(`${base}/settings$`))
  })

  test('admin without access does not see the Private expense, category or visibility controls', async ({ page }) => {
    await loginAs(page, ORG_E.admin)
    await page.goto(`${base}/files/${daily.id}`)
    await expect(page.getByRole('heading', { name: 'Daily Costs' })).toBeVisible()
    await expectTotals(page, { income: '5,000\\.00', expense: '1,200\\.00', net: '3,800\\.00' })
    await expect(sidebar(page).getByRole('link', { name: 'Settings' })).toHaveCount(0)

    await gotoCategories(page)
    await expect(row(page, 'Private')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Visibility of/ })).toHaveCount(0)
  })
})

test.describe('folders and files as admin', () => {
  test('create, rename and delete folders and files', async ({ page }) => {
    const id = uniq()
    const folderName = `Fold ${id}`
    const renamedFolder = `Fold R ${id}`
    const fileName = `File ${id}`
    const renamedFile = `File R ${id}`

    await loginAs(page, ORG_E.admin)
    await gotoDashboard(page)
    const side = sidebar(page)

    // Create folder
    await side.getByRole('button', { name: 'New folder' }).click()
    await dialog(page).getByLabel('Folder name').fill(folderName)
    await dialog(page).getByRole('button', { name: 'Create folder' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(side.getByRole('button', { name: folderName, exact: true })).toBeVisible()

    // Rename folder
    await side.getByRole('button', { name: `Rename folder ${folderName}` }).click()
    await expect(dialog(page).getByLabel('Folder name')).toHaveValue(folderName)
    await dialog(page).getByLabel('Folder name').fill(renamedFolder)
    await dialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(side.getByRole('button', { name: renamedFolder, exact: true })).toBeVisible()
    await expect(side.getByRole('button', { name: folderName, exact: true })).toHaveCount(0)

    // Create file in the folder: navigates to the new file page
    await side.getByRole('button', { name: `New file in ${renamedFolder}` }).click()
    await expect(dialog(page).getByRole('heading', { name: `New file in ${renamedFolder}` })).toBeVisible()
    await dialog(page).getByLabel('File name').fill(fileName)
    await dialog(page).getByRole('button', { name: 'Create file' }).click()
    await expect(page).toHaveURL(new RegExp(`${base}/files/[0-9a-f-]+$`))
    await expect(page.getByRole('heading', { name: fileName })).toBeVisible()
    await expect(side.getByRole('link', { name: new RegExp(fileName) })).toBeVisible()
    await expectTotals(page, { income: '0\\.00', expense: '0\\.00', net: '0\\.00' })

    // Rename file
    await page.getByRole('button', { name: 'Rename file' }).click()
    await dialog(page).getByLabel('File name').fill(renamedFile)
    await dialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByRole('heading', { name: renamedFile })).toBeVisible()
    await expect(side.getByRole('link', { name: new RegExp(renamedFile) })).toBeVisible()

    // Delete file: back to the dashboard
    await page.getByRole('button', { name: 'Delete file' }).click()
    await expect(dialog(page)).toContainText(`Delete ${renamedFile}?`)
    await dialog(page).getByRole('button', { name: 'Delete file' }).click()
    await expect(page).toHaveURL(new RegExp(`${base}/dashboard$`))
    await expect(side.getByRole('link', { name: new RegExp(renamedFile) })).toHaveCount(0)

    // Delete the now-empty folder
    await side.getByRole('button', { name: `Delete folder ${renamedFolder}` }).click()
    await expect(dialog(page)).toContainText(`Delete folder ${renamedFolder}?`)
    await dialog(page).getByRole('button', { name: 'Delete folder' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(side.getByRole('button', { name: renamedFolder, exact: true })).toHaveCount(0)
  })

  test('duplicate folder and file names are rejected', async ({ page }) => {
    await loginAs(page, ORG_E.admin)
    await gotoDashboard(page)
    const side = sidebar(page)

    await side.getByRole('button', { name: 'New folder' }).click()
    await dialog(page).getByLabel('Folder name').fill('Projects')
    await dialog(page).getByRole('button', { name: 'Create folder' }).click()
    await expect(dialog(page).getByRole('alert')).toContainText(/already exists/i)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toBeHidden()

    // A file named like one in the same folder
    await side.getByRole('button', { name: 'New file in Operations' }).click()
    await dialog(page).getByLabel('File name').fill('Payroll')
    await dialog(page).getByRole('button', { name: 'Create file' }).click()
    await expect(dialog(page).getByRole('alert')).toContainText(/already exists/i)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  })

  test('an empty name is rejected before sending', async ({ page }) => {
    await loginAs(page, ORG_E.admin)
    await gotoDashboard(page)
    await sidebar(page).getByRole('button', { name: 'New folder' }).click()
    await dialog(page).getByRole('button', { name: 'Create folder' }).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByText(/name/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create folder' })).toBeVisible()
  })

  test('the dashboard sidebar shows the folder tree and the admin links', async ({ page }) => {
    await loginAs(page, ORG_E.admin)
    await gotoDashboard(page)
    const side = sidebar(page)
    await expect(side.getByRole('heading', { name: 'Folders', exact: true })).toBeVisible()
    await expect(side.getByRole('link', { name: 'Categories' })).toBeVisible()
    await expect(side.getByRole('button', { name: 'New folder' })).toBeVisible()
  })

  test('Website (no entries) shows zero totals', async ({ page }) => {
    await loginAs(page, ORG_E.admin)
    await page.goto(`${base}/files/${website.id}`)
    await expect(page.getByRole('heading', { name: 'Website' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Projects')
    await expectTotals(page, { income: '0\\.00', expense: '0\\.00', net: '0\\.00' })
    await expect(page.getByText(/^0 entries/)).toBeVisible()
  })
})

test.describe('categories as admin', () => {
  test('lists categories by type with entry counts, archived and restricted states', async ({ page }) => {
    await loginAs(page, ORG_E.admin)
    await gotoCategories(page)
    await expect(row(page, 'Rent')).toContainText('1 entry')
    await expect(row(page, 'Sales')).toContainText('2 entries')
    await expect(row(page, 'Unused')).toContainText('0 entries')
    await expect(row(page, 'Legacy')).toContainText('Archived')
    await expect(page.getByRole('region', { name: /Expense/ })).toContainText('Rent')
    await expect(page.getByRole('region', { name: /Income/ })).toContainText('Sales')

    // Delete only for categories without entries
    await expect(row(page, 'Rent').getByRole('button', { name: 'Delete Rent' })).toHaveCount(0)
    await expect(row(page, 'Sales').getByRole('button', { name: 'Delete Sales' })).toHaveCount(0)
    await expect(row(page, 'Unused').getByRole('button', { name: 'Delete Unused' })).toBeVisible()
  })

  test('the type of a category with entries is locked', async ({ page }) => {
    await loginAs(page, ORG_E.admin)
    await gotoCategories(page)
    await page.getByRole('button', { name: 'Edit Rent' }).click()
    const d = dialog(page)
    await expect(d.getByLabel('Category name')).toHaveValue('Rent')
    await expect(d.getByRole('radio')).toHaveCount(0)
    await expect(d).toContainText(/type can.t change/i)
    await d.getByRole('button', { name: 'Cancel' }).click()
    await expect(d).toBeHidden()

    // A category without entries lets you pick the type
    await page.getByRole('button', { name: 'Edit Unused' }).click()
    await expect(dialog(page).getByRole('radio', { name: 'Income' })).toBeChecked()
    await expect(dialog(page).getByRole('radio', { name: 'Expense' })).toBeEnabled()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  })

  test('create, edit, archive, restore and delete a category', async ({ page }) => {
    const name = `Cat ${uniq()}`
    const renamed = `${name} R`
    await loginAs(page, ORG_E.admin)
    await gotoCategories(page)

    // Create
    await page.getByRole('button', { name: 'New category' }).click()
    await dialog(page).getByLabel('Category name').fill(name)
    await dialog(page).getByRole('radio', { name: 'Income' }).check()
    await dialog(page).getByRole('button', { name: 'Blue', exact: true }).click()
    await dialog(page).getByRole('button', { name: 'Create category' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByText(`Created ${name}.`)).toBeVisible()
    await expect(page.getByRole('region', { name: /Income/ })).toContainText(name)
    await expect(row(page, name)).toContainText('0 entries')

    // Edit name and color
    await page.getByRole('button', { name: `Edit ${name}` }).click()
    await expect(dialog(page).getByRole('button', { name: 'Blue', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await dialog(page).getByLabel('Category name').fill(renamed)
    await dialog(page).getByRole('button', { name: 'Pink', exact: true }).click()
    await expect(dialog(page).getByRole('button', { name: 'Pink', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await dialog(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(row(page, renamed)).toBeVisible()
    await expect(row(page, name)).toHaveCount(0)

    // Duplicate name is rejected
    await page.getByRole('button', { name: `Edit ${renamed}` }).click()
    await dialog(page).getByLabel('Category name').fill('Rent')
    await dialog(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog(page).getByRole('alert')).toContainText(/already exists/i)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()

    // Archive and restore
    await page.getByRole('button', { name: `Archive ${renamed}` }).click()
    await expect(page.getByText(`${renamed} was archived.`, { exact: false })).toBeVisible()
    await expect(row(page, renamed)).toContainText('Archived')
    await page.getByRole('button', { name: `Restore ${renamed}` }).click()
    await expect(page.getByText(`${renamed} was restored.`)).toBeVisible()
    await expect(row(page, renamed)).not.toContainText('Archived')

    // Delete (0 entries)
    await page.getByRole('button', { name: `Delete ${renamed}` }).click()
    await expect(dialog(page)).toContainText(`Delete ${renamed}?`)
    await dialog(page).getByRole('button', { name: 'Delete category' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByText(`${renamed} was deleted.`)).toBeVisible()
    await expect(row(page, renamed)).toHaveCount(0)
  })
})

test.describe('category visibility as super admin', () => {
  test('restrict a category to selected members and back to everyone', async ({ page }) => {
    // Uses a temporary category so the seeded ones keep their access lists.
    const name = `Vis ${uniq()}`
    await loginAs(page, ORG_E.superAdmin)
    await gotoCategories(page)
    await page.getByRole('button', { name: 'New category' }).click()
    await dialog(page).getByLabel('Category name').fill(name)
    await dialog(page).getByRole('button', { name: 'Create category' }).click()
    await expect(row(page, name)).toBeVisible()

    // Restrict to Gus Granted
    await page.getByRole('button', { name: `Visibility of ${name}` }).click()
    const d = dialog(page)
    await expect(d.getByRole('radio', { name: 'Everyone in this space' })).toBeChecked()
    await d.getByRole('radio', { name: 'Only selected members' }).check()
    await expect(d.getByRole('checkbox', { name: /Gus Granted/ })).not.toBeChecked()
    await d.getByRole('checkbox', { name: /Gus Granted/ }).check()
    await d.getByRole('button', { name: 'Save visibility' }).click()
    await expect(d).toBeHidden()
    await expect(page.getByText(`${name} is now visible to selected members only.`)).toBeVisible()
    await expect(row(page, name)).toContainText('Selected members only')

    // Reopen: selection persisted
    await page.getByRole('button', { name: `Visibility of ${name}` }).click()
    await expect(dialog(page).getByRole('radio', { name: 'Only selected members' })).toBeChecked()
    await expect(dialog(page).getByRole('checkbox', { name: /Gus Granted/ })).toBeChecked()
    await expect(dialog(page).getByRole('checkbox', { name: /Vera Viewer/ })).not.toBeChecked()

    // Back to everyone
    await dialog(page).getByRole('radio', { name: 'Everyone in this space' }).check()
    await dialog(page).getByRole('button', { name: 'Save visibility' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByText(`${name} is now visible to everyone in this space.`)).toBeVisible()
    await expect(row(page, name)).not.toContainText('Selected members only')

    // Clean up
    await page.getByRole('button', { name: `Delete ${name}` }).click()
    await dialog(page).getByRole('button', { name: 'Delete category' }).click()
    await expect(row(page, name)).toHaveCount(0)
  })

  test('the seeded restricted category shows its state and the granted member', async ({ page }) => {
    await loginAs(page, ORG_E.superAdmin)
    await gotoCategories(page)
    await expect(row(page, 'Private')).toContainText('Selected members only')
    await page.getByRole('button', { name: 'Visibility of Private' }).click()
    await expect(dialog(page).getByRole('checkbox', { name: /Gus Granted/ })).toBeChecked()
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toBeHidden()
  })
})

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 800 } })

  test('the Space menu toggle shows and hides the folder tree', async ({ page }) => {
    await loginAs(page, ORG_E.viewer)
    await page.goto(base)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    const toggle = page.getByRole('button', { name: 'Space menu' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const side = sidebar(page)
    await expect(side.getByRole('link', { name: /Daily Costs/ })).toBeHidden()

    await toggle.click()
    await expect(page.getByRole('button', { name: 'Hide menu' })).toHaveAttribute('aria-expanded', 'true')
    await expect(side.getByRole('link', { name: /Daily Costs/ })).toBeVisible()
    await expect(side.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await noHorizontalScroll(page)

    await page.getByRole('button', { name: 'Hide menu' }).click()
    await expect(side.getByRole('link', { name: /Daily Costs/ })).toBeHidden()

    // Navigating from the menu closes it
    await page.getByRole('button', { name: 'Space menu' }).click()
    await side.getByRole('link', { name: /Payroll/ }).click()
    await expect(page.getByRole('heading', { name: 'Payroll' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Space menu' })).toBeVisible()
    await expect(side.getByRole('link', { name: /Daily Costs/ })).toBeHidden()
    await noHorizontalScroll(page)
  })

  test('the categories page fits a phone as admin', async ({ page }) => {
    await loginAs(page, ORG_E.admin)
    await page.goto(`${base}/categories`)
    await expect(row(page, 'Rent')).toBeVisible()
    await expect(row(page, 'Rent').getByRole('button', { name: 'Edit Rent' })).toBeVisible()
    await noHorizontalScroll(page)
  })
})
