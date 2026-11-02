import { test, expect } from '@playwright/test'

test('home loads and connects to Supabase', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Hisab Nikash' })).toBeVisible()
  await expect(page.getByText('Connected to Supabase.')).toBeVisible({ timeout: 15000 })
  expect(errors).toEqual([])
})
