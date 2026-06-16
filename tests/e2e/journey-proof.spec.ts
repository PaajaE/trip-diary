import { expect, test, type Locator } from '@playwright/test'

test('journey photo workflow stays visible and organized', async ({
  context,
  page,
}) => {
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
  await expect(page.getByRole('heading', { name: momentTitle })).toBeVisible()
  await expect(
    page.locator('#story').getByRole('img', { name: momentTitle }),
  ).toBeVisible()
  await expect(
    page.locator('#gallery').getByRole('img', { name: momentTitle }),
  ).toBeVisible()
  await expectLoadedImage(page.locator('#story img'))
  await expectLoadedImage(page.locator('#gallery img'))
  await expect(page.getByText('1 momentů')).toBeVisible()
  await expect(page.getByText('1 na mapě')).toBeVisible()
  await expect(
    page.getByRole('link', { name: `Otevřít moment ${momentTitle}` }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('img', { name: momentTitle })).toHaveCount(2)
  await expectLoadedImage(page.locator('#story img'))
  await expectLoadedImage(page.locator('#gallery img'))
  await page.screenshot({
    fullPage: true,
    path: 'test-results/proof-3-saved-gallery.png',
  })

  await page.getByRole('button', { name: 'Organizovat cestu' }).click()
  await page.getByLabel('Název etapy').fill(stageTitle)
  await page.getByRole('button', { name: 'Přidat etapu' }).click()
  await expect(page.getByRole('heading', { name: stageTitle })).toBeVisible()
  await page.getByLabel('Zařadit do etapy').selectOption({ label: stageTitle })
  await expect(page.getByRole('heading', { name: stageTitle })).toBeVisible()
  await expect(page.getByRole('img', { name: momentTitle })).toHaveCount(2)
  await expectLoadedImage(page.locator('#story img'))
  await expectLoadedImage(page.locator('#gallery img'))
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
    .poll(() =>
      image.evaluate(
        (element) => (element as { naturalWidth: number }).naturalWidth,
      ),
    )
    .toBeGreaterThan(0)
}
