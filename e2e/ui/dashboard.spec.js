import { ORG_F } from '../fixtures/ids.js'
import { test, expect } from './helpers.js'
import { loginAs } from './management-helpers.js'
import { cash, cashUrl, dashboardUrl, dhakaDate, ledger, sharedSession, totalOf } from './entries-helpers.js'

// Milestone 6 UI tests: the space dashboard (SPEC.md §5.8) in "F Ledger" (Org F).
//
// The windows below are chosen so that the numbers do not depend on today's entries. The
// entries tests add entries dated today, and this file can run in parallel with them.
//   earlier = 7 days, from 10 to 4 days ago: Salary +50,000 (5 days ago), Bulk 55 × Groceries
//             (1…55, 10 days ago) = 1,540.00. Nothing in the previous 7 days.
//   recent  = 3 days, from 3 to 1 days ago: Groceries 300 (3 days ago, deleted user), Secret 700
//             (2 days ago, restricted), Rent 15,000 (1 day ago). The previous 3 days hold Salary.
const earlier = { from: dhakaDate(-10), to: dhakaDate(-4) }
const recent = { from: dhakaDate(-3), to: dhakaDate(-1) }
const windowUrl = (w) => `${dashboardUrl}?period=custom&from=${w.from}&to=${w.to}`

const summary = (page) => page.getByLabel('Summary')
const expenseTable = (page) => page.getByRole('region', { name: 'Expense by category' })
const incomeTable = (page) => page.getByRole('region', { name: 'Income by category' })
const recentList = (page) => page.getByRole('region', { name: 'Recent entries' })
const periodGroup = (page) => page.getByRole('group', { name: 'Period' })

test.describe.serial('viewer (Val) dashboard', () => {
  const s = sharedSession(ORG_F.viewer)

  test('signs in, opens the space from the home page and shows the dashboard', async () => {
    const { page } = s
    await page.goto('/')
    await page.getByRole('link', { name: /^F Ledger/ }).click()
    await expect(page).toHaveURL(new RegExp(`/spaces/${ledger.id}/dashboard$`))
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(periodGroup(page).getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
    await expect(summary(page)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Recent entries' })).toBeVisible()
  })

  test('the period buttons switch the period and the custom range shows From and To', async () => {
    const { page } = s
    await page.goto(dashboardUrl)
    const period = (name) => periodGroup(page).getByRole('button', { name, exact: true })

    for (const [name, param] of [
      ['This week', 'week'],
      ['This month', 'month'],
      ['This year', 'year'],
    ]) {
      await period(name).click()
      await expect(page).toHaveURL(new RegExp(`period=${param}`))
      await expect(period(name)).toHaveAttribute('aria-pressed', 'true')
      await expect(period('Today')).toHaveAttribute('aria-pressed', 'false')
    }

    await period('Custom range').click()
    await expect(page).toHaveURL(/period=custom/)
    await expect(period('Custom range')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('From', { exact: true })).toBeVisible()
    await expect(page.getByLabel('To', { exact: true })).toBeVisible()

    await period('Today').click()
    await expect(page).not.toHaveURL(/period=/)
    await expect(page.getByLabel('From', { exact: true })).toBeHidden()
  })

  test('a custom range shows the summary cards, with no previous period to compare with', async () => {
    const { page } = s
    await page.goto(dashboardUrl)
    await periodGroup(page).getByRole('button', { name: 'Custom range', exact: true }).click()
    await page.getByLabel('From', { exact: true }).fill(earlier.from)
    await page.getByLabel('To', { exact: true }).fill(earlier.to)
    await expect(page).toHaveURL(new RegExp(`from=${earlier.from}`))

    await expect(summary(page)).toContainText('1,540.00')
    await expect(summary(page)).toContainText('50,000.00')
    await expect(summary(page)).toContainText('48,460.00')
    // The previous 7 days have no entries, so the cards say so instead of showing a percentage.
    await expect(summary(page).getByText('No data for the previous period')).toHaveCount(3)
  })

  test('expense and income by category show the amounts, shares and entry counts', async () => {
    const { page } = s
    await page.goto(windowUrl(earlier))

    const groceries = expenseTable(page).getByRole('row', { name: /Groceries/ })
    await expect(groceries.locator('td').nth(1)).toContainText('1,540.00')
    await expect(groceries.locator('td').nth(2)).toHaveText('100%')
    await expect(groceries.locator('td').nth(3)).toHaveText('55')

    const salary = incomeTable(page).getByRole('row', { name: /Salary/ })
    await expect(salary.locator('td').nth(1)).toContainText('50,000.00')
    await expect(salary.locator('td').nth(3)).toHaveText('1')
  })

  test('a window with a restricted category hides it, and the comparison uses the previous days', async () => {
    const { page } = s
    await page.goto(windowUrl(recent))

    await expect(summary(page)).toContainText('15,300.00')
    // Income fell from 50,000 (the previous 3 days) to nothing.
    await expect(summary(page).getByText('Down 100% on the previous period')).toHaveCount(1)
    // Expense has nothing to compare with.
    await expect(summary(page).getByText('No data for the previous period')).toHaveCount(1)

    await expect(expenseTable(page).getByRole('row', { name: /Rent/ }).locator('td').nth(1)).toContainText('15,000.00')
    await expect(expenseTable(page).getByRole('row', { name: /Groceries/ }).locator('td').nth(1)).toContainText('300.00')
    await expect(incomeTable(page)).toContainText('No income in this period.')

    // Secret is restricted: neither its name nor its amount appears for this viewer.
    await expect(page.locator('body')).not.toContainText(/secret/i)
  })

  test('recent entries link to their file and show the latest ten', async () => {
    const { page } = s
    await page.goto(dashboardUrl)
    await expect(recentList(page).getByRole('listitem')).toHaveCount(10)

    const rent = recentList(page).getByRole('link', { name: /flat rent/ })
    await expect(rent).toHaveAttribute('href', cashUrl)
    await rent.click()
    await expect(page).toHaveURL(new RegExp(`${cashUrl}$`))
    await expect(page.getByRole('heading', { name: 'Cash Book' })).toBeVisible()
  })

  test('the scope select limits the figures and the recent entries to one file', async () => {
    const { page } = s
    await page.goto(windowUrl(earlier))
    await page.getByLabel('Scope', { exact: true }).selectOption({ label: cash.name })
    await expect(page).toHaveURL(new RegExp(`scope=file(%3A|:)${cash.id}`))

    // Cash Book has only the salary in this window; Bulk's 55 entries are left out.
    await expect(summary(page)).toContainText('50,000.00')
    await expect(summary(page)).not.toContainText('1,540.00')
    await expect(expenseTable(page)).toContainText('No expense in this period.')

    const hrefs = await recentList(page).locator('a[href*="/files/"]').evaluateAll((links) => links.map((a) => a.getAttribute('href')))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toContain(cash.id)
  })

  test('clicking a category opens All entries filtered to that category and period', async () => {
    const { page } = s
    await page.goto(windowUrl(earlier))
    await expenseTable(page).getByRole('link', { name: 'Groceries', exact: true }).click()

    await expect(page).toHaveURL(/\/entries\?/)
    await expect(page).toHaveURL(new RegExp(`from=${earlier.from}`))
    await expect(page).toHaveURL(new RegExp(`to=${earlier.to}`))
    await expect(page.getByRole('heading', { name: 'All entries' })).toBeVisible()
    await expect(page.getByLabel('From', { exact: true })).toHaveValue(earlier.from)
    await expect(page.getByText('Categories (1)')).toBeVisible()
    await expect(totalOf(page, 'Totals of the filtered entries', 'Expense')).toContainText('1,540.00')
    await expect(totalOf(page, 'Totals of the filtered entries', 'Entries')).toContainText('55')
  })
})

test.describe('granted viewer (Gil) dashboard', () => {
  test('a viewer granted the restricted category sees Secret in the figures', async ({ page }) => {
    await loginAs(page, ORG_F.granted)
    await page.goto(windowUrl(recent))

    await expect(summary(page)).toContainText('16,000.00')
    await expect(expenseTable(page).getByRole('row', { name: /Secret/ }).locator('td').nth(1)).toContainText('700.00')
    await expect(expenseTable(page).getByRole('row', { name: /Rent/ }).locator('td').nth(2)).toHaveText('94%')
  })
})
