import { expect, test } from '@playwright/test'

test('offline trip capture keeps the journey readable and shows pending sync', async ({
  context,
  page,
}) => {
  const unique = crypto.randomUUID().slice(0, 8)
  const journeyTitle = `Offline cesta ${unique}`
  const momentTitle = `Offline moment ${unique}`

  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 51.1784, longitude: -115.5708 })

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`offline-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`offline_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()
  await expect(page).toHaveURL('/dashboard')

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page
    .getByLabel('Krátký popis')
    .fill('Smoke test pro offline načtení cesty a momentu.')
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  await page
    .locator('header')
    .getByRole('link', { name: 'Přidat moment', exact: true })
    .click()
  await page.getByLabel('Název', { exact: true }).fill(momentTitle)
  await page
    .getByLabel('Příběh')
    .fill('Uloženo offline a čeká na synchronizaci.')
  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()

  await expect(page.getByRole('heading', { name: momentTitle })).toBeVisible()
  await expect(page.getByText('Čeká na synchronizaci')).toBeVisible()
})
