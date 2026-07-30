import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'

function readLocalSupabaseEnv(): { serviceRoleKey: string; url: string } {
  const stdout = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
  })
  const env = Object.fromEntries(
    stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [
          line.slice(0, separator),
          line.slice(separator + 1).replace(/^"|"$/g, ''),
        ]
      }),
  )

  const url = env.API_URL ?? env.SUPABASE_URL
  const serviceRoleKey = env.SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY

  if (
    typeof url !== 'string' ||
    url.length === 0 ||
    typeof serviceRoleKey !== 'string' ||
    serviceRoleKey.length === 0
  ) {
    throw new Error(
      'Local Supabase status did not provide API_URL/SERVICE_ROLE_KEY',
    )
  }

  return { serviceRoleKey, url }
}

async function momentTitles(
  page: import('@playwright/test').Page,
  unique: string,
): Promise<string[]> {
  const readerTitles = await page
    .locator('.reader-moment-card h4')
    .allTextContents()
  if (readerTitles.some((title) => title.includes(unique))) {
    return readerTitles
      .map((title) => title.trim())
      .filter((title) => title.includes(unique))
  }

  const ownerTitles = await page.locator('article h4').allTextContents()
  return ownerTitles
    .map((title) => title.trim())
    .filter((title) => title.includes(unique))
}

test('public and owner journey pages show moments newest first by event_at', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
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

  const { serviceRoleKey, url } = readLocalSupabaseEnv()
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const moment of moments) {
    const { error } = await admin
      .from('entries')
      .update({ event_at: moment.eventAt })
      .eq('title', moment.title)
    expect(error).toBeNull()
  }

  const expectedNewestFirst = [
    moments[2].title,
    moments[1].title,
    moments[0].title,
  ]

  await expect
    .poll(
      async () => {
        await page.goto(`/j/${journeyId}`)
        return momentTitles(page, unique)
      },
      { timeout: 60_000 },
    )
    .toEqual(expectedNewestFirst)

  await page.reload({ waitUntil: 'networkidle' })
  await expect
    .poll(async () => momentTitles(page, unique), { timeout: 60_000 })
    .toEqual(expectedNewestFirst)

  const publicSlug = `ordering-${unique}-${journeyId.replaceAll('-', '').slice(0, 8)}`
  const publicPath = `/${familyHandle}/${publicSlug}`

  const anonymous = await browser.newContext()
  const anonymousPage = await anonymous.newPage()

  await expect
    .poll(
      async () => {
        await anonymousPage.goto(publicPath)
        await expect(
          anonymousPage.getByRole('heading', { name: journeyTitle }),
        ).toBeVisible({ timeout: 15_000 })
        return momentTitles(anonymousPage, unique)
      },
      { timeout: 90_000 },
    )
    .toEqual(expectedNewestFirst)

  await anonymousPage.reload({ waitUntil: 'networkidle' })
  await expect
    .poll(async () => momentTitles(anonymousPage, unique), {
      timeout: 60_000,
    })
    .toEqual(expectedNewestFirst)

  await anonymousPage.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(async () => momentTitles(anonymousPage, unique), {
      timeout: 60_000,
    })
    .toEqual(expectedNewestFirst)

  await anonymousPage.setViewportSize({ width: 1280, height: 800 })
  await expect
    .poll(async () => momentTitles(anonymousPage, unique), {
      timeout: 60_000,
    })
    .toEqual(expectedNewestFirst)
  await anonymous.close()

  const middle = moments[1]
  const { error: bumpError } = await admin
    .from('entries')
    .update({ event_at: '2026-12-01T10:00:00.000Z' })
    .eq('title', middle.title)
  expect(bumpError).toBeNull()

  await expect
    .poll(
      async () => {
        await page.goto(`/j/${journeyId}`)
        return momentTitles(page, unique)
      },
      { timeout: 60_000 },
    )
    .toEqual([middle.title, moments[2].title, moments[0].title])

  const { data: deletedRows, error: deleteError } = await admin
    .from('entries')
    .delete()
    .eq('title', middle.title)
    .select('id')
  expect(deleteError).toBeNull()
  expect(deletedRows?.length).toBeGreaterThan(0)

  await expect
    .poll(
      async () => {
        await page.goto(`/j/${journeyId}`)
        return momentTitles(page, unique)
      },
      { timeout: 60_000 },
    )
    .toEqual([moments[2].title, moments[0].title])
})
