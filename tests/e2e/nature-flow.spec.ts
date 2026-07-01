import { expect, test } from '@playwright/test'

test('nature template flow adds goals to a new trip', async ({ page }) => {
  const unique = crypto.randomUUID().slice(0, 8)
  const journeyTitle = `Šumava ${unique}`

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`nature-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`nature_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()
  await expect(page).toHaveURL('/dashboard')

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page.getByRole('button', { name: 'Přírodní cíle (volitelné)' }).click()
  await expect(page.getByText('Šumava')).toBeVisible()
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
  await expect(page.getByText('Příroda na cestě')).toBeVisible()
  await expect(page.getByText(/0 z \d+ zahlédnuto/)).toBeVisible()
})
