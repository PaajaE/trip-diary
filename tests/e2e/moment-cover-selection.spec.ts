import { expect, test, type Locator } from '@playwright/test'
import path from 'node:path'
import {
  waitForFullySynced,
  waitForPublicJourneyPath,
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
  return page.locator('#story article').filter({
    has: page.getByRole('heading', { name: title, level: 4 }),
  })
}

/** Expand only if collapsed — post-save highlight already expands the moment. */
async function ensureMomentExpanded(article: Locator): Promise<void> {
  const collapse = article.getByRole('button', { name: 'Sbalit moment' })
  if ((await collapse.count()) > 0) {
    await expect(collapse).toBeVisible()
    return
  }
  await article.getByRole('button', { name: 'Rozbalit moment' }).click()
  await expect(collapse).toBeVisible()
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

  const expanded = momentArticle(page, momentTitle)
  await ensureMomentExpanded(expanded)
  await expect(expanded.locator('img')).toHaveCount(3, { timeout: 20_000 })
  await expect(expanded.getByText('Titulní', { exact: true })).toHaveCount(1)
  await expect(
    expanded.getByRole('button', { name: 'Nastavit jako titulní' }),
  ).toHaveCount(2)

  await page.reload({ waitUntil: 'networkidle' })
  await waitForFullySynced(page)
  const afterReload = momentArticle(page, momentTitle)
  await ensureMomentExpanded(afterReload)
  await expect(afterReload.locator('img')).toHaveCount(3, { timeout: 20_000 })
  await expect(afterReload.getByText('Titulní', { exact: true })).toHaveCount(1)

  await afterReload
    .getByRole('button', { name: 'Nastavit jako titulní' })
    .first()
    .click()
  await expect(page.getByText('Titulní fotka byla aktualizována.')).toBeVisible(
    { timeout: 15_000 },
  )
  await expect(afterReload.getByText('Titulní', { exact: true })).toHaveCount(1)

  await expectLoadedImage(page.locator('#gallery img'))
  await waitForFullySynced(page)

  const publicPath = await waitForPublicJourneyPath(journeyId)
  expect(publicPath).toContain(`/${familyHandle}/`)

  // Fresh anonymous context — avoid SPA residue from other routes.
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
