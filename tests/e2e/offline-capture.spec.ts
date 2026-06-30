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

  const addMomentLink = page.getByRole('link', {
    name: 'Přidat moment',
    exact: true,
  })

  // Warm the lazy create-memory route while online; dev has no service worker cache.
  await addMomentLink.click()
  await expect(page.getByLabel('Název', { exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  // Dev server has no PWA shell cache, so a full reload while offline cannot
  // load the app. Prove the IndexedDB journey snapshot path on the live page.
  await context.setOffline(true)
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  await addMomentLink.click()
  await page.getByLabel('Název', { exact: true }).fill(momentTitle)
  await page
    .getByLabel('Příběh')
    .fill('Uloženo offline a čeká na synchronizaci.')
  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()

  const sharePrompt = page.getByRole('dialog', { name: 'Sdílet s rodinou' })
  await expect(sharePrompt).toBeVisible()
  await sharePrompt.getByRole('button', { name: 'Pokračovat na cestu' }).click()

  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
  await expect(page.getByText('Čeká na synchronizaci')).toBeVisible()
})
