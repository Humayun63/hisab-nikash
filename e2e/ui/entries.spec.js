import { ORG_F } from '../fixtures/ids.js'
import { test, expect } from './helpers.js'
import { loginAs, noHorizontalScroll, uniq } from './management-helpers.js'
import {
  bulkUrl,
  cash,
  cashUrl,
  dhakaDate,
  entriesTable,
  entriesUrl,
  entryRows,
  sharedSession,
  sidebar,
  totalOf,
} from './entries-helpers.js'

// Milestone 5 UI tests: entries on the Cash Book file page and the space-wide "All entries" view
// (SPEC.md §5.7), in "F Ledger" (Org F). The test data is seeded (see seed.sql).
//
// Cash Book as a viewer or editor sees it (Secret is hidden from them): 6 entries.
const CASH = { income: '52,000.00', expense: '16,650.50', net: '35,349.50', entries: 6 }

const filtered = 'Totals of the filtered entries'
const fileTotals = 'File totals'

test.describe.serial('editor (Eli): quick add, edit and delete on Cash Book', () => {
  // Eli is the only user that writes in this describe. Its entries are dated today and are
  // deleted again, so the seeded totals are back at the end. The tests share one signed-in page
  // and run in order; a failure skips the rest of the block.
  const s = sharedSession(ORG_F.editor)
  const note = `qa ${uniq()}`
  const edited = `${note} edited`

  test('quick add saves on Enter, keeps the category and date, and updates the totals', async () => {
    const { page } = s
    await page.goto(cashUrl)
    await expect(page.getByRole('heading', { name: 'Cash Book' })).toBeVisible()
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText(CASH.expense)

    const category = page.getByRole('combobox', { name: 'Category' })
    await category.fill('Groc')
    await page.getByRole('option', { name: 'Groceries', exact: true }).click()
    await expect(category).toHaveValue('Groceries')
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(dhakaDate())

    await page.getByLabel('Amount', { exact: true }).fill('42.5')
    await page.getByLabel('Note', { exact: true }).fill(note)
    await page.getByLabel('Note', { exact: true }).press('Enter')

    await expect(page.getByText(/Saved .*42\.50 · Groceries/)).toBeVisible()
    await expect(entryRows(page).filter({ hasText: note })).toHaveCount(1)
    // The form keeps the category and date, and clears the amount and note.
    await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('')
    await expect(category).toHaveValue('Groceries')
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(dhakaDate())
    await expect(page.getByLabel('Note', { exact: true })).toHaveValue('')

    await expect(totalOf(page, fileTotals, 'Expense')).toContainText('16,693.00')
    await expect(page.getByText(/^7 entries\./)).toBeVisible()
  })

  test('validates amount and date, and does not offer archived categories', async () => {
    const { page } = s
    const add = page.getByRole('button', { name: 'Add', exact: true })

    await add.click()
    await expect(page.getByText('Amount is required')).toBeVisible()

    await page.getByLabel('Amount', { exact: true }).fill('5')
    await page.getByLabel('Date', { exact: true }).fill(dhakaDate(1))
    await add.click()
    await expect(page.getByText(/can.t be in the future/)).toBeVisible()
    await page.getByLabel('Date', { exact: true }).fill(dhakaDate())

    // "Old" is archived: it is not an option for new entries.
    await page.getByRole('combobox', { name: 'Category' }).fill('Old')
    await expect(page.getByRole('option', { name: /Old/ })).toHaveCount(0)
    await expect(page.getByText('No matches')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByLabel('Amount', { exact: true }).fill('')

    // Nothing was saved.
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText('16,693.00')
  })

  test('edits an entry in a modal', async () => {
    const { page } = s
    await page.getByRole('button', { name: /^Edit entry: Groceries, .*42\.50/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit entry' })
    await expect(dialog.getByLabel('Amount', { exact: true })).toHaveValue('42.50')
    await dialog.getByLabel('Amount', { exact: true }).fill('60')
    await dialog.getByLabel('Note', { exact: true }).fill(edited)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    await expect(entryRows(page).filter({ hasText: edited })).toContainText('60.00')
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText('16,710.50')
  })

  test('deletes an entry after confirmation', async () => {
    const { page } = s
    await page.getByRole('button', { name: /^Delete entry: Groceries, .*60\.00/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this entry?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete entry', exact: true }).click()

    await expect(dialog).toBeHidden()
    await expect(entryRows(page).filter({ hasText: edited })).toHaveCount(0)
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText(CASH.expense)
    await expect(page.getByText(/^6 entries\./)).toBeVisible()
  })
  // SPEC.md §5.7: after saving, the cursor goes back to Amount for the next entry. Last in the
  // block: if this fails, the block's shared page is gone, so the tests above must come first.
  test('after saving, focus returns to Amount for the next entry', async () => {
    const { page } = s
    await page.goto(cashUrl)
    await page.getByRole('combobox', { name: 'Category' }).fill('Groc')
    await page.getByRole('option', { name: 'Groceries', exact: true }).click()
    await page.getByLabel('Amount', { exact: true }).fill('1')
    await page.getByLabel('Note', { exact: true }).fill(`${note} focus`)
    await page.getByLabel('Note', { exact: true }).press('Enter')
    await expect(page.getByText(/Saved .*1\.00 · Groceries/)).toBeVisible()
    try {
      await expect(page.getByLabel('Amount', { exact: true })).toBeFocused()
    } finally {
      // Remove the entry even when the focus check fails, so the totals stay the seeded ones.
      await page.getByRole('button', { name: /^Delete entry: Groceries, .*1\.00,/ }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Delete entry', exact: true }).click()
      await expect(entryRows(page).filter({ hasText: `${note} focus` })).toHaveCount(0)
    }
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText(CASH.expense)
  })
})

test.describe.serial('viewer (Val): read-only Cash Book, sorting, filters, pagination', () => {
  const s = sharedSession(ORG_F.viewer)

  test('a viewer sees the entries but no add form and no edit or delete buttons', async () => {
    const { page } = s
    await page.goto(cashUrl)
    await expect(page.getByRole('heading', { name: 'Cash Book' })).toBeVisible()
    await expect(entryRows(page)).toHaveCount(CASH.entries)
    await expect(page.getByRole('heading', { name: 'Add entry' })).toHaveCount(0)
    await expect(page.getByLabel('Amount', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Edit entry/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Delete entry/ })).toHaveCount(0)
    await expect(totalOf(page, fileTotals, 'Income')).toContainText(CASH.income)
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText(CASH.expense)
  })

  test('the restricted category Secret never appears for a viewer without access', async () => {
    const { page } = s
    await page.goto(cashUrl)
    await expect(entryRows(page)).toHaveCount(CASH.entries)
    await expect(entriesTable(page)).not.toContainText(/secret/i)
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText(CASH.expense)

    await page.locator('summary', { hasText: 'Categories' }).click()
    await expect(page.locator('#entry-filters')).not.toContainText(/secret/i)
    await expect(page.locator('#entry-filters')).toContainText('Groceries')
  })

  test('a deleted user is shown as the creator of an entry that has none', async () => {
    const { page } = s
    await page.goto(cashUrl)
    const row = entryRows(page).filter({ hasText: 'by a deleted user' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Deleted user')
  })

  test('sorting by amount, largest first and then smallest first', async () => {
    const { page } = s
    await page.goto(cashUrl)
    const header = entriesTable(page).getByRole('columnheader', { name: /^Amount/ })
    const firstAmount = entryRows(page).first().locator('td').nth(3)

    await header.getByRole('button').click()
    await expect(page).toHaveURL(/sort=amount/)
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect(firstAmount).toContainText('50,000.00')

    await header.getByRole('button').click()
    await expect(page).toHaveURL(/dir=asc/)
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect(firstAmount).toContainText('100.00')
  })

  test('sorting by Added by puts entries of deleted users last', async () => {
    const { page } = s
    await page.goto(cashUrl)
    await entriesTable(page).getByRole('columnheader', { name: /^Added by/ }).getByRole('button').click()
    await expect(page).toHaveURL(/sort=added_by/)
    await expect(entryRows(page).last()).toContainText('Deleted user')
  })

  test('filtering by type updates the list and its totals, and clears again', async () => {
    const { page } = s
    await page.goto(cashUrl)
    await page.getByLabel('Type', { exact: true }).selectOption('expense')
    await expect(page).toHaveURL(/type=expense/)
    await expect(entryRows(page)).toHaveCount(4)
    await expect(entryRows(page).locator('td:nth-child(3)')).toHaveText(['Expense', 'Expense', 'Expense', 'Expense'])
    await expect(totalOf(page, filtered, 'Income')).toContainText('0.00')
    await expect(totalOf(page, filtered, 'Expense')).toContainText(CASH.expense)
    await expect(totalOf(page, filtered, 'Entries')).toContainText('4')
    // The file totals are not filtered.
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText(CASH.expense)
    await expect(page.getByText(/^6 entries\./)).toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page).not.toHaveURL(/type=/)
    await expect(entryRows(page)).toHaveCount(CASH.entries)
  })

  test('filtering by added by and by category', async () => {
    const { page } = s
    await page.goto(cashUrl)

    await page.getByLabel('Added by', { exact: true }).selectOption({ label: ORG_F.editor2.name })
    await expect(page).toHaveURL(new RegExp(`by=${ORG_F.editor2.id}`))
    await expect(entryRows(page)).toHaveCount(2)
    await expect(totalOf(page, filtered, 'Income')).toContainText('2,000.00')
    await expect(totalOf(page, filtered, 'Expense')).toContainText('100.00')
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page).not.toHaveURL(/by=/)
    await expect(entryRows(page)).toHaveCount(CASH.entries)

    await page.locator('summary', { hasText: 'Categories' }).click()
    // click + toBeChecked: the list state follows the URL a render later, so check() would
    // verify the box before React has applied the change.
    await page.getByLabel('Rent', { exact: true }).click()
    await expect(page.getByLabel('Rent', { exact: true })).toBeChecked()
    await expect(page).toHaveURL(new RegExp(`cat=${ORG_F.ledger.categories.rent.id}`))
    await expect(page.getByText('Categories (1)')).toBeVisible()
    await expect(entryRows(page)).toHaveCount(1)
    await expect(entryRows(page)).toContainText('15,000.00')
    await expect(totalOf(page, filtered, 'Expense')).toContainText('15,000.00')
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText(CASH.expense)
  })

  test('a filtered and sorted list opened from its URL shows the same filters, sort and totals', async () => {
    const { page } = s
    await page.goto(`${cashUrl}?type=income&sort=amount&dir=asc`)
    await expect(entryRows(page)).toHaveCount(2)
    await expect(entryRows(page).first().locator('td').nth(3)).toContainText('2,000.00')
    await expect(page.getByLabel('Type', { exact: true })).toHaveValue('income')
    await expect(totalOf(page, filtered, 'Income')).toContainText('52,000.00')
    await expect(totalOf(page, filtered, 'Net')).toContainText('52,000.00')
  })

  test('the Bulk file is paginated 50 rows per page', async () => {
    const { page } = s
    await page.goto(bulkUrl)
    await expect(page.getByText(/^1–50 of 55$/)).toBeVisible()
    await expect(entryRows(page)).toHaveCount(50)
    await expect(totalOf(page, filtered, 'Expense')).toContainText('1,540.00')

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText(/^51–55 of 55$/)).toBeVisible()
    await expect(entryRows(page)).toHaveCount(5)

    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(page.getByText(/^1–50 of 55$/)).toBeVisible()
  })

  test('All entries lists the whole space with a File column and a File filter', async () => {
    const { page } = s
    await page.goto(cashUrl)
    await sidebar(page).getByRole('link', { name: 'All entries' }).click()
    await expect(page).toHaveURL(new RegExp(`${entriesUrl}$`))
    await expect(page.getByRole('heading', { name: 'All entries' })).toBeVisible()
    await expect(entriesTable(page).getByRole('columnheader', { name: 'File', exact: true })).toBeVisible()
    // Cash Book (6 visible) and Bulk (55) in this space; Data files are in F Data.
    await expect(totalOf(page, filtered, 'Entries')).toContainText('61')
    await expect(totalOf(page, filtered, 'Expense')).toContainText('18,190.50')

    await page.getByLabel('File', { exact: true }).selectOption({ label: cash.name })
    await expect(page).toHaveURL(new RegExp(`file=${cash.id}`))
    await expect(entryRows(page)).toHaveCount(CASH.entries)
    await expect(entryRows(page).filter({ hasText: cash.name })).toHaveCount(CASH.entries)
    await expect(totalOf(page, filtered, 'Expense')).toContainText(CASH.expense)
  })

  test('on a phone the entries are cards and the filters sit behind a Filters button', async () => {
    const { page } = s
    await page.setViewportSize({ width: 390, height: 844 })
    try {
      await page.goto(cashUrl)
      await expect(entryRows(page)).toHaveCount(CASH.entries)
      await expect(entryRows(page).first().locator('td').nth(3)).toBeVisible()
      await expect(page.getByLabel('Sort by')).toBeVisible()
      await expect(page.getByLabel('Type', { exact: true })).toBeHidden()

      // The button's label changes to "Hide filters" when open, so find it by what it controls.
      const toggle = page.locator('button[aria-controls="entry-filters"]')
      await expect(toggle).toHaveText('Filters')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(toggle).toHaveText('Hide filters')
      await page.getByLabel('Type', { exact: true }).selectOption('income')
      await expect(entryRows(page)).toHaveCount(2)
      await noHorizontalScroll(page)
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
  })
})

test.describe('granted viewer (Gil)', () => {
  test('a viewer granted the restricted category sees Secret and its amount', async ({ page }) => {
    await loginAs(page, ORG_F.granted)
    await page.goto(cashUrl)
    await expect(page.getByRole('heading', { name: 'Cash Book' })).toBeVisible()
    await expect(entryRows(page)).toHaveCount(CASH.entries + 1)
    await expect(entryRows(page).filter({ hasText: 'secret spend' })).toContainText('700.00')
    await expect(totalOf(page, fileTotals, 'Expense')).toContainText('17,350.50')
  })
})
