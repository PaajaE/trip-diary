import { expect, test } from '@playwright/test'

test('shows the primary capture action', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('main').getByRole('link', { name: 'Rychlá poznámka' }),
  ).toBeVisible()
})

test('creates an account and publishes an entry', async ({ browser, page }) => {
  test.setTimeout(120_000)
  const email = `traveler-${crypto.randomUUID()}@example.test`
  const username = `user_${crypto.randomUUID().slice(0, 8)}`

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Uživatelské jméno').fill(username)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()

  await expect(page).toHaveURL('/dashboard')
  await expect(
    page.getByRole('heading', { name: new RegExp(username) }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Vytvořit cestu' })).toBeVisible()

  const familyHandle = `family-${crypto.randomUUID().slice(0, 8)}`
  await page.goto('/spaces')
  await page
    .getByRole('heading', { name: 'Aktivní prostor' })
    .locator('..')
    .getByRole('button')
    .click()
  await page.getByRole('button', { name: 'Vytvořit rodinný prostor' }).click()
  await page.getByLabel('Název rodiny nebo skupiny').fill('Ečerovi')
  await page.getByLabel('Veřejná adresa').fill(familyHandle)
  await page.getByRole('button', { name: 'Vytvořit rodinný prostor' }).click()
  await expect(page.getByRole('button', { name: /Ečerovi/ })).toBeVisible()
  await page
    .getByRole('link', { name: 'Spravovat členy prostoru Ečerovi' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Členové prostoru' }),
  ).toBeVisible()
  await page.getByLabel('E-mail člena').fill('family@example.test')
  await page.getByRole('button', { name: 'Vytvořit pozvánku' }).click()
  await expect(page.getByText('Pozvánka je připravená')).toBeVisible()
  await expect(page.getByText(/\/invite\//)).toBeVisible()

  await page.goto('/entries/new')
  await page.getByLabel('Název').fill('Rodinný tip')
  await page.getByLabel('Příběh').fill('Tip publikovaný pod rodinným profilem.')
  await page.getByRole('button', { name: 'Uložit a publikovat' }).click()
  await expect(page.getByRole('heading', { name: 'Rodinný tip' })).toBeVisible()

  const familyContext = await browser.newContext()
  const familyPage = await familyContext.newPage()
  await familyPage.goto(`/${familyHandle}`)
  await expect(
    familyPage.getByRole('heading', { name: 'Ečerovi' }),
  ).toBeVisible()
  await familyPage.getByRole('button', { name: /Rodinný tip/ }).click()
  await expect(familyPage).toHaveURL(
    new RegExp(`/${familyHandle}/tipy/rodinny-tip-[a-f0-9]{8}$`),
  )
  await expect(
    familyPage.getByRole('heading', { name: 'Rodinný tip' }),
  ).toBeVisible()
  await familyContext.close()

  await page.goto('/settings/profile')
  await page.getByLabel('Zobrazované jméno').fill('Ečerovi na cestě')
  await page
    .getByLabel('Vybrat fotografii')
    .setInputFiles('src/assets/hero.png')
  await page.getByRole('button', { name: 'Uložit profil' }).click()
  await expect(page.getByText('Profil je uložený.')).toBeVisible()
  await expect(page.getByLabel('Účet: Ečerovi na cestě')).toBeVisible()

  await page.goto(`/u/${username}`)
  await expect(
    page.getByRole('heading', { name: 'Ečerovi na cestě' }),
  ).toBeVisible()
  await expect(page.locator('main img')).toHaveCount(1)

  await page.goto('/entries/new')
  await page.getByLabel('Název').fill('První cesta')
  await page.getByLabel('Příběh').fill('Vzpomínka uložená nejdříve v zařízení.')
  await page.locator('input[type="file"]').setInputFiles('src/assets/hero.png')
  await page.getByRole('button', { name: 'Uložit a publikovat' }).click()
  await expect(page.getByRole('heading', { name: 'První cesta' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'První cesta', exact: true }),
  ).toBeVisible({ timeout: 15_000 })

  const publicUrl = page.url()
  const anonymousContext = await browser.newContext()
  const anonymousPage = await anonymousContext.newPage()
  await anonymousPage.goto(publicUrl)
  await expect(
    anonymousPage.getByRole('heading', { name: 'První cesta' }),
  ).toBeVisible()
  await expect(
    anonymousPage.getByRole('button', { name: 'První cesta', exact: true }),
  ).toBeVisible({ timeout: 15_000 })
  await anonymousContext.close()

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill('Kanada 2026')
  await page
    .getByLabel('Krátký popis')
    .fill('Etapy, místa a praktické poznámky na jednom místě.')
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: 'Kanada 2026' })).toBeVisible()

  await page.getByRole('button', { name: 'Spravovat cestu' }).click()
  await page.getByLabel('Název denního štítku').fill('Skalnaté hory')
  await page.getByRole('button', { name: 'Přidat denní štítek' }).click()
  await expect(
    page.getByRole('heading', { name: 'Spravovat denní štítky' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Zavřít' }).first().click()

  const publicJourneyContext = await browser.newContext()
  const publicJourneyPage = await publicJourneyContext.newPage()
  await publicJourneyPage.goto(page.url())
  await expect(
    publicJourneyPage.getByRole('heading', { name: 'Kanada 2026' }),
  ).toBeVisible()
  await publicJourneyContext.close()

  const journeyId = page.url().split('/').at(-1)
  if (journeyId === undefined) {
    throw new Error('Journey URL is missing its identifier')
  }
  const friendlyJourneyContext = await browser.newContext()
  const friendlyJourneyPage = await friendlyJourneyContext.newPage()
  await friendlyJourneyPage.goto(
    `/${familyHandle}/kanada-2026-${journeyId.replaceAll('-', '').slice(0, 8)}`,
  )
  await expect(
    friendlyJourneyPage.getByRole('heading', { name: 'Kanada 2026' }),
  ).toBeVisible()
  await friendlyJourneyContext.close()
})
