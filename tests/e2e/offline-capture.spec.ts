import { expect, test } from '@playwright/test'

test('offline trip capture keeps the journey readable and shows pending sync', async ({
  context,
  page,
}) => {
  test.setTimeout(60_000)

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
  await expect(page).toHaveURL('/dashboard', { timeout: 30_000 })

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page
    .getByLabel('Krátký popis')
    .fill('Smoke test pro offline načtení cesty a momentu.')
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  // Warm the lazy create-memory route while online; dev has no service worker cache.
  await page.getByRole('link', { name: 'Přidat moment', exact: true }).click()
  await expect(page.getByLabel('Název', { exact: true })).toBeVisible()

  // Capture on the already-loaded route so offline navigation does not refetch chunks.
  await context.setOffline(true)
  await page.getByLabel('Název', { exact: true }).fill(momentTitle)
  await page
    .getByLabel('Příběh')
    .fill('Uloženo offline a čeká na synchronizaci.')
  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()

  const sharePrompt = page.getByRole('dialog', { name: 'Sdílet s rodinou' })
  await expect(sharePrompt).toBeVisible()
  await sharePrompt.getByRole('button', { name: 'Pokračovat na cestu' }).click()

  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
  await expect
    .poll(async () => page.getByText(/čeká na synchronizaci/i).count(), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
})
