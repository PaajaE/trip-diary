import { expect, test, type Locator } from '@playwright/test'
import path from 'node:path'
import {
  waitForFullySynced,
  waitForPublicJourneyPath,
  waitForRemoteEntryPhotos,
} from './helpers/e2e-sync'

const fixturesDir = path.join('tests', 'e2e', 'fixtures')

async function expectLoadedImage(image: Locator): Promise<void> {
  await expect(image.first()).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(
      async () => {
        try {
          return await image.first().evaluate((element) => {
            const width = (element as { naturalWidth?: number }).naturalWidth
            return typeof width === 'number' ? width : 0
          })
        } catch {
          return 0
        }
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0)
}

function momentArticle(page: import('@playwright/test').Page, title: string) {
  return page.locator('#story article[data-entry-id]').filter({
    has: page.getByRole('heading', { name: title, level: 4 }),
  })
}

async function openMomentEntry(
  page: import('@playwright/test').Page,
  momentTitle: string,
): Promise<void> {
  const card = momentArticle(page, momentTitle)
  await card.getByRole('heading', { name: momentTitle, level: 4 }).click()
  await expect(page).toHaveURL(/\/e\//, { timeout: 20_000 })
}

test('moment cover selection persists across edit, refresh, and public page', async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(240_000)
  const unique = crypto.randomUUID().slice(0, 8)
  const username = `cover_${unique}`
  const familyHandle = `cover-${unique}`
  const journeyTitle = `Cover journey ${unique}`
  const momentTitle = `Cover moment ${unique}`

  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 51.0452, longitude: -114.0719 })

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`cover-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(username)
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
  await page.getByLabel('Název rodiny nebo skupiny').fill(`Cover ${unique}`)
  await page.getByLabel('Veřejná adresa').fill(familyHandle)
  await page.getByRole('button', { name: 'Vytvořit rodinný prostor' }).click()
  await expect(
    page.getByRole('button', { name: new RegExp(`@${familyHandle}`) }),
  ).toBeVisible()

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page.getByLabel('Krátký popis').fill('Cover selection proof')
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  const journeyUrlMatch = /\/j\/([^/?]+)/.exec(page.url())
  const journeyId = journeyUrlMatch?.[1]
  if (journeyId === undefined) {
    throw new Error('Expected journey URL after create')
  }

  await page.goto(`/j/${journeyId}/memory/new`)
  await page.getByLabel('Název', { exact: true }).fill(momentTitle)
  await page.getByLabel('Příběh').fill('Multiple photos with explicit cover.')
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      path.join(fixturesDir, 'cover-a.png'),
      path.join(fixturesDir, 'cover-b.png'),
      path.join(fixturesDir, 'cover-c.png'),
    ])
  await expect(page.getByText('Vybráno fotografií: 3')).toBeVisible()
  await expect(page.locator('form img')).toHaveCount(3)

  await page
    .getByRole('button', { name: 'Nastavit jako titulní' })
    .nth(0)
    .click()
  await expect(
    page.getByRole('button', { name: 'Titulní', pressed: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()
  await expect(page).toHaveURL(new RegExp(`/j/${journeyId}`), {
    timeout: 30_000,
  })
  await expect(
    page.getByRole('heading', { name: momentTitle, level: 4 }),
  ).toBeVisible({ timeout: 20_000 })

  await waitForFullySynced(page)

  const overviewCard = momentArticle(page, momentTitle)
  await expect(overviewCard.locator('img')).toHaveCount(3, { timeout: 20_000 })

  await openMomentEntry(page, momentTitle)
  await expect(page.locator('main img')).toHaveCount(3, { timeout: 20_000 })
  await expect(page.getByText('Titulní', { exact: true })).toHaveCount(0)

  await page.reload({ waitUntil: 'networkidle' })
  await waitForFullySynced(page)
  await expect(page.locator('main img')).toHaveCount(3, { timeout: 20_000 })
  await expect(page.getByText('Titulní', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Upravit' }).first().click()
  await expect(page.getByRole('button', { name: 'Hotovo' })).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Posunout dříve' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Posunout později' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: `${momentTitle} 1 · Titulní` }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: `${momentTitle} 2` }).click()
  await expect(page.getByRole('dialog', { name: 'Fotografie' })).toBeVisible()
  await page.getByRole('button', { name: 'Nastavit jako titulní' }).click()
  await expect(page.getByText('Titulní fotka byla aktualizována.')).toBeVisible(
    { timeout: 15_000 },
  )
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(
    page.getByText('Klikněte na důležitý bod fotografie.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Zarámování titulní fotky' }).click()
  await page.getByRole('button', { name: 'Uložit změny' }).click()
  await expect(
    page.getByText('Zarámování titulní fotky bylo uloženo.'),
  ).toBeVisible({ timeout: 15_000 })
  await page
    .getByRole('dialog', { name: 'Fotografie' })
    .getByRole('button', { name: 'Zrušit' })
    .click()
  await expect(page.getByRole('dialog', { name: 'Fotografie' })).toHaveCount(0)
  // Cover sorts first after refresh, so the star badge stays on index 1.
  await expect(
    page.getByRole('button', { name: `${momentTitle} 1 · Titulní` }),
  ).toHaveCount(1, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Hotovo' }).click()
  await expect(
    page.getByRole('button', { name: 'Upravit' }).first(),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /· Titulní$/ })).toHaveCount(0)
  await waitForFullySynced(page)

  const entryIdMatch = /\/e\/([^/?]+)/.exec(page.url())
  const entryId = entryIdMatch?.[1]
  if (entryId === undefined) {
    throw new Error('Expected entry URL after cover change')
  }
  await waitForRemoteEntryPhotos(entryId, 3)

  const publicPath = await waitForPublicJourneyPath(journeyId)
  expect(publicPath).toContain(`/${familyHandle}/`)

  const anonymous = await browser.newContext()
  const anonymousPage = await anonymous.newPage()
  await anonymousPage.goto(publicPath, { waitUntil: 'networkidle' })
  await expect(
    anonymousPage.getByRole('heading', { name: journeyTitle }),
  ).toBeVisible({ timeout: 30_000 })
  await expectLoadedImage(
    anonymousPage.locator('#gallery img, .reader-moment-card img'),
  )
  await anonymous.close()
})
