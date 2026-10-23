import { expect, test } from '@playwright/test'
import { atlasUrl, mockPublicBackend } from './atlas-mock'

test('journey page renders and fits the viewport width', async ({ page }) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dolomity pěšky, 2025' }),
  ).toBeVisible()
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - window.innerWidth',
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const dir = process.env.SHOTS_DIR
  if (dir !== undefined) {
    // Lazy images below the fold only load once scrolled to.
    await page.evaluate(
      `(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
      })()`,
    )
    await page.waitForTimeout(800)
    await page.screenshot({
      fullPage: true,
      path: `${dir}/journey-${test.info().project.name}.png`,
    })
  }
})

test('stage page: days, notes, rail and map', async ({ page }) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  await page.getByRole('link', { name: 'Začít číst' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Přílet a první kroky' }),
  ).toBeVisible()
  await expect(page.locator('[data-day]')).toHaveCount(3)
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - window.innerWidth',
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const dir = process.env.SHOTS_DIR
  if (dir !== undefined) {
    await page.evaluate(
      `(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
      })()`,
    )
    await page.waitForTimeout(800)
    await page.screenshot({
      fullPage: true,
      path: `${dir}/stage-${test.info().project.name}.png`,
    })
  }
})
