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

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'VITE_E2E=1 pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
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
