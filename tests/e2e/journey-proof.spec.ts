import { expect, test, type Locator } from '@playwright/test'

test('journey photo workflow stays visible and organized', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000)
  const unique = crypto.randomUUID().slice(0, 8)
  const journeyTitle = `Důkazní cesta ${unique}`
  const momentTitle = `Moment s fotkou ${unique}`
  const stageTitle = `Etapa ${unique}`

  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 51.1784, longitude: -115.5708 })

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`proof-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`proof_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()
  await expect(page).toHaveURL('/dashboard')

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page
    .getByLabel('Krátký popis')
    .fill('Lokální důkaz, že fotka zůstane v momentu i galerii.')
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: 'test-results/proof-1-empty-journey.png',
  })

  const journeyUrlMatch = /\/j\/([^/?]+)/.exec(page.url())
  const journeyId = journeyUrlMatch?.[1]
  if (journeyId === undefined) {
    throw new Error('Expected journey URL after create')
  }
  await page.goto(`/j/${journeyId}/memory/new`)
  await expect(
    page.getByRole('heading', { name: 'Přidat moment do cesty' }),
  ).toBeVisible()
  await page.getByLabel('Název', { exact: true }).fill(momentTitle)
  await page
    .getByLabel('Příběh')
    .fill('Tahle fotka byla skutečně vybrána, uložena a znovu načtena.')
  await page.locator('input[type="file"]').setInputFiles('src/assets/hero.png')
  await expect(page.getByText('Vybráno fotografií: 1')).toBeVisible()
  await expect(page.locator('form img')).toHaveCount(1)
  await page.getByRole('button', { name: 'Použít aktuální polohu' }).click()
  await expect(page.getByText('Použita aktuální poloha')).toBeVisible()
  await expect(page.getByText(/Vybráno: 51\.1784, -115\.5708/)).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: 'test-results/proof-2-photo-review.png',
  })

  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: momentTitle, level: 4 }),
  ).toBeVisible()
  await expect(
    page
      .locator('#story')
      .getByRole('button', { name: momentTitle, exact: true }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(
    page.locator('#gallery').getByRole('button', { name: momentTitle }),
  ).toBeVisible({ timeout: 15_000 })
  await expectLoadedImage(page.locator('#story img'))
  await expectLoadedImage(page.locator('#gallery img'))
  await expect(page.getByText('1 moment')).toBeVisible()
  await expect(page.getByText('1 fotka')).toBeVisible()
  await page.reload()
  await expect(
    page
      .locator('#story')
      .getByRole('button', { name: momentTitle, exact: true }),
  ).toHaveCount(1)
  await expect(
    page
      .locator('#gallery')
      .getByRole('button', { name: momentTitle, exact: true }),
  ).toHaveCount(1)
  await page.screenshot({
    fullPage: true,
    path: 'test-results/proof-3-saved-gallery.png',
  })

  await page.getByRole('button', { name: 'Spravovat cestu' }).click()
  await page.getByLabel('Název denního štítku').fill(stageTitle)
  await page.getByRole('button', { name: 'Přidat denní štítek' }).click()
  await expect(
    page.getByRole('heading', { name: 'Spravovat denní štítky' }),
  ).toBeVisible()
  await page.getByLabel('Přesunout do dne').selectOption({ label: stageTitle })
  await expect(
    page
      .locator('#story')
      .getByRole('button', { name: momentTitle, exact: true }),
  ).toHaveCount(1)
  await expect(
    page
      .locator('#gallery')
      .getByRole('button', { name: momentTitle, exact: true }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: 'Zavřít' }).first().click()
  await page.screenshot({
    fullPage: true,
    path: 'test-results/proof-4-organized-stage.png',
  })

  await page.getByLabel(`Účet: proof_${unique}`).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.mouse.click(10, 200)
  await expect(page.getByRole('menu')).toHaveCount(0)
})

async function expectLoadedImage(image: Locator) {
  await expect
    .poll(() => image.first().evaluate('(element) => element.naturalWidth'), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
}
