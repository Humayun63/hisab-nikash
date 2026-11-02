import { test as teardown, expect } from '@playwright/test'
import { runSql } from './support/db.js'

teardown('remove e2e fixtures from Supabase', async () => {
  teardown.setTimeout(120_000)
  const out = runSql({ file: 'e2e/fixtures/cleanup.sql' })
  expect(out, `cleanup failed:\n${out}`).not.toMatch(/"_tag":\s*"Error"|ERROR/)
})
