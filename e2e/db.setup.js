import { test as setup, expect } from '@playwright/test'
import { runSql } from './support/db.js'

setup('reset e2e fixtures in Supabase', async () => {
  setup.setTimeout(240_000)
  for (const file of ['e2e/fixtures/cleanup.sql', 'e2e/fixtures/seed.sql']) {
    const out = runSql({ file })
    expect(out, `${file} failed:\n${out}`).not.toMatch(/"_tag":\s*"Error"|ERROR/)
  }
})
