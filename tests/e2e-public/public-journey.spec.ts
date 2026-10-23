import { expect, test } from '@playwright/test'
import { atlasUrl, mockPublicBackend } from './atlas-mock'

const noOverflow = async (page: import('@playwright/test').Page) => {
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - window.innerWidth',
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test('journey -> stage -> moment -> lightbox -> back', async ({ page }) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dolomity pěšky, 2025' }),
  ).toBeVisible()
  await noOverflow(page)

  // Journey -> stage (first chapter).
  await page.getByRole('link', { name: 'Začít číst' }).click()
  await expect(page).toHaveURL(/\/e\/[^/]+$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Přílet a první kroky' }),
  ).toBeVisible()
  await expect(page.locator('[data-day]')).toHaveCount(3)
  await noOverflow(page)

  // Stage -> moment (a stop of the first day).
  await page
    .locator('[data-day]')
    .first()
    .getByRole('list', { name: 'Zastávky dne' })
    .getByRole('link')
    .first()
    .click()
  await expect(page).toHaveURL(/\/m\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/Zastávka 1 z 9/)).toBeVisible()
  await noOverflow(page)

  // Moment -> lightbox: counter, arrows, Esc, focus returns to the opener.
  const hero = page.getByRole('button', { name: 'Otevřít fotku' }).first()
  await hero.click()
  const dialog = page.getByRole('dialog', { name: 'Prohlížeč fotek' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('status')).toHaveText('1 / 4')
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('status')).toHaveText('2 / 4')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(hero).toBeFocused()

  // Back: moment -> stage -> journey.
  await page.goBack()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Přílet a první kroky' }),
  ).toBeVisible()
  await page.goBack()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dolomity pěšky, 2025' }),
  ).toBeVisible()
})

test('lightbox swipes between photos', async ({ page }) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  await page.getByRole('link', { name: 'Začít číst' }).click()
  await page
    .locator('[data-day]')
    .first()
    .getByRole('button', { name: 'Otevřít fotku' })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Prohlížeč fotek' })
  await expect(dialog.getByRole('status')).toHaveText(/^1 \/ \d+$/)
  const box = await dialog.getByRole('figure').boundingBox()
  if (box === null) throw new Error('no figure')
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * 0.8, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 5 })
  await page.mouse.up()
  await expect(dialog.getByRole('status')).toHaveText(/^2 \/ \d+$/)
})
