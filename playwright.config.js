import { defineConfig, devices } from '@playwright/test'

// Make VITE_SUPABASE_* from .env available to the database tests.
try {
  process.loadEnvFile('.env')
} catch {
  // No .env: the database tests will fail with a clear sign-in error.
}

// E2E_PORT runs a second checkout (e.g. a worktree) next to a dev server already on 5173.
const PORT = Number(process.env.E2E_PORT ?? 5173)

export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', testMatch: /.*\.spec\.js/, testIgnore: /(db|ui)\/.*/, use: { ...devices['Desktop Chrome'] } },
    // Database permission tests against the linked Supabase project. They seed their own
    // users/data (*@e2e.hisab-nikash.test) and remove them afterwards.
    { name: 'db-setup', testMatch: /db\.setup\.js/, teardown: 'db-teardown' },
    { name: 'db-teardown', testMatch: /db\.teardown\.js/ },
    // Tests within a file run in order; files run in parallel (each uses its own organization).
    { name: 'db', testMatch: /db\/.*\.spec\.js/, dependencies: ['db-setup'] },
    // Browser tests of the app's pages, signing in as seeded users (see e2e/fixtures/ids.js).
    { name: 'ui', testMatch: /ui\/.*\.spec\.js/, dependencies: ['db-setup'], use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
  },
})
