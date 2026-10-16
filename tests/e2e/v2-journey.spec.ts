import { expect, test } from '@playwright/test'

test('a new journey opens the v2 workspace and its quick note', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const unique = crypto.randomUUID().slice(0, 8)
  const journeyTitle = `V2 ${unique}`

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`v2-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`v2_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()
  await expect(page).toHaveURL('/dashboard')

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()

  await expect(page).toHaveURL(/\/j\/[^/]+\/workspace$/)
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  await page.getByRole('link', { name: 'Rychlý zápis' }).first().click()
  await expect(page).toHaveURL(/\/j\/[^/]+\/quick$/)
  await page.getByLabel('Co se právě děje?').fill('Medvěd u cesty')
  await page.getByLabel('Přidat moji polohu').uncheck()
  await page.getByRole('button', { name: 'Uložit zápis' }).click()
  await expect(page.getByText('Zápis uložen')).toBeVisible()

  await page.getByRole('link', { name: 'Zobrazit v cestě' }).click()
  await expect(page.getByText('Medvěd u cesty')).toBeVisible()
})
