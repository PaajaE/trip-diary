import { expect, test } from '@playwright/test'

test('nature golden path: template, photo moment, and spotting', async ({
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8)
  const journeyTitle = `Šumava ${unique}`
  const momentTitle = `Zahlédnutí ${unique}`

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`nature-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`nature_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()
  await expect(page).toHaveURL('/dashboard')

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
  await expect(page.getByText('Příroda na cestě')).toBeVisible()
  await expect(page.getByText(/0 z 5 zahlédnuto/)).toBeVisible()

  await page
    .locator('header')
    .getByRole('link', { name: 'Přidat moment', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Přidat moment do cesty' }),
  ).toBeVisible()
  await page.getByLabel('Název', { exact: true }).fill(momentTitle)
  await page
    .getByLabel('Příběh')
    .fill('Krátký moment s fotkou pro přírodní zahlédnutí.')
  await page.locator('input[type="file"]').setInputFiles('src/assets/hero.png')
  await expect(page.getByText('Vybráno fotografií: 1')).toBeVisible()
  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()

  await expect(page.getByText('Co jsi zahlédl?')).toBeVisible()
  await page.getByRole('button', { name: 'Rys ostrovid' }).click()
  await expect(
    page.getByRole('heading', { name: 'Sdílet s rodinou' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Zavřít' }).click()

  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
  await expect(page.getByText(/1 z 5 zahlédnuto/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Rys ostrovid' }).locator('.bg-primary'),
  ).toBeVisible()
})
