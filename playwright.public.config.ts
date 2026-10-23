import { defineConfig, devices } from '@playwright/test'

/**
 * E2E of the public reader (journey, stage, moment, lightbox). The backend is
 * mocked in the browser (tests/e2e-public/atlas-mock.ts), so no Supabase is
 * needed. Run with `pnpm test:e2e:public`.
 */
const PORT = 5174
// Optional: a Chromium build that differs from the one Playwright pins.
const executablePath = process.env.PW_CHROMIUM_PATH
const launchOptions =
  executablePath === undefined || executablePath === ''
    ? {}
    : { launchOptions: { executablePath } }

export default defineConfig({
  testDir: './tests/e2e-public',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    locale: 'cs-CZ',
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    env: {
      VITE_MEDIA_BASE_URL: 'http://media.test',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key-for-mocked-e2e',
      VITE_SUPABASE_URL: 'http://supabase.test',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `http://127.0.0.1:${String(PORT)}`,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        ...launchOptions,
        viewport: { width: 1400, height: 900 },
      },
    },
    {
      name: 'mobile-390',
      use: {
        ...devices['Desktop Chrome'],
        ...launchOptions,
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
})
