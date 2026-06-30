import { expect, test } from '@playwright/test'

test('saving a journey moment still succeeds when photo processing fails', async ({
  page,
}) => {
  // Force photo processing to fail by disabling workers and breaking canvas encoding.
  await page.addInitScript(`
    window.Worker = undefined;
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      cb(null);
    };
  `)

  const unique = crypto.randomUUID().slice(0, 8)
  const journeyTitle = `Foto fail cesta ${unique}`
  const momentTitle = `Foto fail moment ${unique}`

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`photo-fail-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`photo_fail_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()
  await expect(page).toHaveURL('/dashboard')

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page.getByLabel('Krátký popis').fill('E2E: foto processing fail.')
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  await page
    .locator('header')
    .getByRole('link', { name: 'Přidat moment', exact: true })
    .click()

  await page.getByLabel('Název', { exact: true }).fill(momentTitle)

  // Use the regular <input type="file"> picker.
  const fileInput = page.locator('input[type="file"]')
  await expect(fileInput).toBeVisible()
  await fileInput.setInputFiles({
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/akvB0cAAAAASUVORK5CYII=',
      'base64',
    ),
    mimeType: 'image/png',
    name: 'tiny.png',
  })

  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()

  // We should still be redirected back to the journey page.
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  // And we should see the notice that photos failed, not a stuck form.
  await expect(
    page.getByText(
      'Moment se uložil, ale fotky se v tomto prohlížeči nepodařilo zpracovat. Fotky můžeš přidat později z jiného zařízení.',
    ),
  ).toBeVisible()

  // The moment should exist in the journey content.
  await expect(page.getByText(momentTitle)).toBeVisible()
})
