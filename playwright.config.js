import { defineConfig, devices } from '@playwright/test'

// Make VITE_SUPABASE_* from .env available to the database tests.
try {
  process.loadEnvFile('.env')
} catch {
  // No .env: the database tests will fail with a clear sign-in error.
}

export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', testMatch: /.*\.spec\.js/, testIgnore: /db\/.*/, use: { ...devices['Desktop Chrome'] } },
    // Database permission tests against the linked Supabase project. They seed their own
    // users/data (*@e2e.hisab-nikash.test) and remove them afterwards.
    { name: 'db-setup', testMatch: /db\.setup\.js/, teardown: 'db-teardown' },
    { name: 'db-teardown', testMatch: /db\.teardown\.js/ },
    // Single file, so its tests run in order in one worker.
    { name: 'db', testMatch: /db\/permissions\.spec\.js/, dependencies: ['db-setup'] },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
})
