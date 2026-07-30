import { expect, test, type Page } from '@playwright/test'
import {
  createAdminClient,
  momentTitlesOnPage,
  waitForFullySynced,
  waitForPublicJourneyPath,
  waitForRemoteEntriesByTitle,
} from './helpers/e2e-sync'

async function publicMomentTitles(
  page: Page,
  publicPath: string,
  journeyTitle: string,
  unique: string,
): Promise<string[]> {
  await page.goto(publicPath, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.locator('.reader-moment-card h4').first()).toBeVisible({
    timeout: 20_000,
  })
  return momentTitlesOnPage(page, unique)
}

test('public and owner journey pages show moments newest first by event_at', async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000)
  const unique = crypto.randomUUID().slice(0, 8)
  const journeyTitle = `Ordering ${unique}`
  const familyHandle = `order-${unique}`
  const moments = [
    { eventAt: '2026-01-01T10:00:00.000Z', title: `Oldest ${unique}` },
    { eventAt: '2026-03-15T10:00:00.000Z', title: `Middle ${unique}` },
    { eventAt: '2026-06-30T10:00:00.000Z', title: `Newest ${unique}` },
  ] as const

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`order-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`order_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()
  await expect(page).toHaveURL('/dashboard')

  await page.goto('/spaces')
  await page
    .getByRole('heading', { name: 'Aktivní prostor' })
    .locator('..')
    .getByRole('button')
    .click()
  await page.getByRole('button', { name: 'Vytvořit rodinný prostor' }).click()
  await page.getByLabel('Název rodiny nebo skupiny').fill(`Order ${unique}`)
  await page.getByLabel('Veřejná adresa').fill(familyHandle)
  await page.getByRole('button', { name: 'Vytvořit rodinný prostor' }).click()
  await expect(
    page.getByRole('button', { name: new RegExp(`@${familyHandle}`) }),
  ).toBeVisible()

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  const journeyUrlMatch = /\/j\/([^/?]+)/.exec(page.url())
  const journeyId = journeyUrlMatch?.[1]
  if (journeyId === undefined) {
    throw new Error('Expected journey URL after create')
  }

  for (const moment of moments) {
    await page.goto(`/j/${journeyId}/memory/new`)
    await expect(
      page.getByRole('heading', { name: 'Přidat moment do cesty' }),
    ).toBeVisible()
    await page.getByLabel('Název', { exact: true }).fill(moment.title)
    await page.getByLabel('Příběh').fill(`Body for ${moment.title}`)
    await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()
    await expect(page).toHaveURL(new RegExp(`/j/${journeyId}`), {
      timeout: 30_000,
    })
    await expect(
      page.getByRole('heading', { name: moment.title, level: 4 }),
    ).toBeVisible({ timeout: 15_000 })
  }

  await waitForFullySynced(page)
  await waitForRemoteEntriesByTitle(moments.map((moment) => moment.title))

  await expect
    .poll(async () => momentTitlesOnPage(page, unique), { timeout: 30_000 })
    .toHaveLength(3)

  const admin = createAdminClient()
  for (const moment of moments) {
    const { data, error } = await admin
      .from('entries')
      .update({ event_at: moment.eventAt })
      .eq('title', moment.title)
      .select('id')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  }

  const expectedNewestFirst = [
    moments[2].title,
    moments[1].title,
    moments[0].title,
  ]

  const publicPath = await waitForPublicJourneyPath(journeyId)
  expect(publicPath).toContain(`/${familyHandle}/`)

  const anonymous = await browser.newContext()
  const anonymousPage = await anonymous.newPage()

  await expect
    .poll(
      async () =>
        publicMomentTitles(anonymousPage, publicPath, journeyTitle, unique),
      { timeout: 90_000 },
    )
    .toEqual(expectedNewestFirst)

  await anonymousPage.reload({ waitUntil: 'networkidle' })
  await expect(
    anonymousPage.locator('.reader-moment-card h4').first(),
  ).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => momentTitlesOnPage(anonymousPage, unique), {
      timeout: 60_000,
    })
    .toEqual(expectedNewestFirst)

  await anonymousPage.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(async () => momentTitlesOnPage(anonymousPage, unique), {
      timeout: 60_000,
    })
    .toEqual(expectedNewestFirst)

  await anonymousPage.setViewportSize({ width: 1280, height: 800 })
  await expect
    .poll(async () => momentTitlesOnPage(anonymousPage, unique), {
      timeout: 60_000,
    })
    .toEqual(expectedNewestFirst)

  const middle = moments[1]
  const { data: bumped, error: bumpError } = await admin
    .from('entries')
    .update({ event_at: '2026-12-01T10:00:00.000Z' })
    .eq('title', middle.title)
    .select('id')
  expect(bumpError).toBeNull()
  expect(bumped?.length).toBeGreaterThan(0)

  // Fresh page after out-of-band DB edits — avoids stale reader cache.
  const afterBump = await anonymous.newPage()
  await expect
    .poll(
      async () =>
        publicMomentTitles(afterBump, publicPath, journeyTitle, unique),
      { timeout: 90_000 },
    )
    .toEqual([middle.title, moments[2].title, moments[0].title])
  await afterBump.close()

  const { data: deletedRows, error: deleteError } = await admin
    .from('entries')
    .delete()
    .eq('title', middle.title)
    .select('id')
  expect(deleteError).toBeNull()
  expect(deletedRows?.length).toBeGreaterThan(0)

  const afterDelete = await anonymous.newPage()
  await expect
    .poll(
      async () =>
        publicMomentTitles(afterDelete, publicPath, journeyTitle, unique),
      { timeout: 90_000 },
    )
    .toEqual([moments[2].title, moments[0].title])
  await afterDelete.close()

  await anonymous.close()
})
