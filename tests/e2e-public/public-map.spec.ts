import { expect, test } from '@playwright/test'
import { atlasUrl, mockPublicBackend } from './atlas-mock'

test('legend hover lights the stage on the strip and dims other pins', async ({
  page,
}) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  const legend = page.locator('[data-stage-id]')
  await expect(legend).toHaveCount(5)
  await page.locator('#route').scrollIntoViewIfNeeded()
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({
    timeout: 15_000,
  })
  await legend.nth(1).hover()
  // The strip fades the other stages ...
  await expect(
    page.locator('#route ul.flex.h-1\\.5 > li.opacity-35'),
  ).toHaveCount(4)
  // ... and on the map at least one marker of another stage is dimmed.
  await expect
    .poll(() =>
      page.evaluate<number>(
        `Array.from(document.querySelectorAll('.maplibregl-marker')).filter((el) => el.style.opacity === '0.3').length`,
      ),
    )
    .toBeGreaterThan(0)
  await page.mouse.move(5, 5)
  await expect(
    page.locator('#route ul.flex.h-1\\.5 > li.opacity-35'),
  ).toHaveCount(0)
})

test('300+ pins stay clustered and the map becomes ready quickly', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await mockPublicBackend(page, { photosPerStop: 1, stopsPerDay: 21 })
  await page.goto(atlasUrl)
  await page.locator('#route').scrollIntoViewIfNeeded()
  await expect(page.locator('.maplibregl-marker').first()).toBeVisible({
    timeout: 20_000,
  })
  const markers = await page.locator('.maplibregl-marker').count()
  // 399 pins would be 399 DOM markers without clustering.
  expect(markers).toBeLessThan(80)
  // Cluster bubbles carry their stage colour (single-stage clusters).
  const colours = await page.evaluate<number>(
    `Array.from(document.querySelectorAll('.maplibregl-marker[data-stage]:not(button)')).filter((el) => el.style.background !== '').length`,
  )
  expect(colours).toBeGreaterThan(0)
})
