import { ORG_F } from '../fixtures/ids.js'
import { test, expect } from './helpers.js'
import { loginAs } from './management-helpers.js'

// Shared helpers for the entries and dashboard UI tests (Org F, space "F Ledger").
// Seeded data (see seed.sql): Cash Book has 6 visible entries for a viewer (7 with Secret),
// Bulk has 55 Groceries entries. Dates are relative to today in Asia/Dhaka.

export const ledger = ORG_F.ledger
export const cash = ledger.files.cash
export const bulk = ledger.files.bulk
export const cashUrl = `/spaces/${ledger.id}/files/${cash.id}`
export const bulkUrl = `/spaces/${ledger.id}/files/${bulk.id}`
export const entriesUrl = `/spaces/${ledger.id}/entries`
export const dashboardUrl = `/spaces/${ledger.id}/dashboard`

// Yyyy-mm-dd in Asia/Dhaka, `offset` days from today.
export function dhakaDate(offset = 0) {
  return new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
}

export const sidebar = (page) => page.getByRole('complementary', { name: `${ledger.name} navigation` })
export const entriesTable = (page) => page.getByRole('table', { name: 'Entries' })
export const entryRows = (page) => entriesTable(page).locator('tbody tr')

// A value in a totals bar, found by the bar's aria-label: 'File totals' (the file's own totals)
// or 'Totals of the filtered entries' (the list's totals, which follow the filters).
export function totalOf(page, region, label) {
  return page.getByLabel(region).locator('div', { has: page.getByText(label, { exact: true }) }).locator('dd')
}

// A browser page signed in once for a whole describe block. Its tests run in order and share
// the page, so they must not depend on a fresh page. Uncaught page errors fail the block.
export function sharedSession(user) {
  const session = { errors: [] }
  test.beforeAll(async ({ browser }, testInfo) => {
    session.context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 1280, height: 720 },
    })
    session.page = await session.context.newPage()
    session.page.on('pageerror', (err) => session.errors.push(err.message))
    await loginAs(session.page, user)
  })
  test.afterAll(async () => {
    try {
      expect(session.errors, 'uncaught page errors').toEqual([])
    } finally {
      await session.context?.close()
    }
  })
  return session
}
