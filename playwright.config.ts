import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

function resolveChromiumExecutable(): string | undefined {
  try {
    const require = createRequire(import.meta.url)
    const playwrightCoreEntry = require.resolve('playwright-core')
    const playwrightCoreDir = path.dirname(playwrightCoreEntry)
    const browsersDir = path.join(playwrightCoreDir, '.local-browsers')
    const chromiumDir = fs
      .readdirSync(browsersDir)
      .find((entry) => entry.startsWith('chromium-'))
    if (chromiumDir === undefined) return undefined

    const executable = path.join(
      browsersDir,
      chromiumDir,
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    )
    return fs.existsSync(executable) ? executable : undefined
  } catch {
    return undefined
  }
}

const chromiumExecutablePath = resolveChromiumExecutable()
const offlineAuthFile = 'playwright/.auth/offline-user.json'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'VITE_E2E=1 pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 120_000 : 60_000,
  },
  projects: [
    {
      name: 'offline-setup',
      testMatch: /offline-auth\.setup\.ts/,
    },
    {
      name: 'offline-chromium',
      dependencies: ['offline-setup'],
      testMatch: /offline-capture\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: offlineAuthFile,
        ...(chromiumExecutablePath !== undefined
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        ...(chromiumExecutablePath !== undefined
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutablePath !== undefined
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {}),
      },
    },
  ],
})
