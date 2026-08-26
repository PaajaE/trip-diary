import { expect, test } from '@playwright/test'

// Nature suggestions were removed from the journey authoring workspace.
// Spotting still works on moments elsewhere; this golden path is retired.
test.skip('nature golden path: template, photo moment, and spotting', async ({
  page,
}) => {
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
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
})
