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

  const journeyUrlMatch = /\/j\/([^/?]+)/.exec(page.url())
  const journeyId = journeyUrlMatch?.[1]
  if (journeyId === undefined) {
    throw new Error('Expected journey URL after create')
  }

  // Warm lazy routes in one browser session; full page.goto clears Vite module cache.
  await page.goto(`/j/${journeyId}`)
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
  await page.getByLabel('Přidat moment').click()
  await page
    .getByRole('dialog', { name: 'Přidat na cestu' })
    .getByRole('button', {
      name: 'Přidat fotky Vyber fotky z galerie nebo z alba.',
    })
    .click()
  await expect(page.getByLabel('Název', { exact: true })).toBeVisible()

  // Capture on the already-loaded route so offline navigation does not refetch chunks.
  await context.setOffline(true)
  await page.getByLabel('Název', { exact: true }).fill(momentTitle)
  await page
    .getByLabel('Příběh')
    .fill('Uloženo offline a čeká na synchronizaci.')
  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()

  await expect(page).toHaveURL(new RegExp(`/j/${journeyId}`), {
    timeout: 30_000,
  })
  await expect(page.locator('#story')).toBeVisible({ timeout: 30_000 })
  const momentCard = page.locator('#story article[data-entry-id]').filter({
    has: page.getByRole('heading', { name: momentTitle, level: 4 }),
  })
  await momentCard.scrollIntoViewIfNeeded()
  await expect(momentCard).toBeVisible({ timeout: 30_000 })
  await expect(momentCard.getByLabel(/čeká na synchronizaci/i)).toBeVisible({
    timeout: 15_000,
  })
})
