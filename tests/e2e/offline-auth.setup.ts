import fs from 'node:fs'
import path from 'node:path'
import { expect, test as setup } from '@playwright/test'

const authFile = 'playwright/.auth/offline-user.json'

setup('create offline e2e user', async ({ page }) => {
  const unique = crypto.randomUUID().slice(0, 8)

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`offline-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`offline_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()

  await expect(page).toHaveURL('/dashboard', { timeout: 30_000 })

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
