import { expect, test } from '@playwright/test'

test('shows the primary capture action', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('main').getByRole('link', { name: 'Přidat vzpomínku' }),
  ).toBeVisible()
})

test('creates an account and publishes an entry', async ({ browser, page }) => {
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
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Přidat vzpomínku' }),
  ).toBeVisible()

  const familyHandle = `family-${crypto.randomUUID().slice(0, 8)}`
  await page.goto('/spaces')
  await page.getByRole('button', { name: new RegExp(username) }).click()
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
  await page.getByLabel('Fotografie').setInputFiles('src/assets/hero.png')
  await page.getByRole('button', { name: 'Uložit a publikovat' }).click()
  await expect(page.getByRole('heading', { name: 'První cesta' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'První cesta' })).toBeVisible()

  const publicUrl = page.url()
  const anonymousContext = await browser.newContext()
  const anonymousPage = await anonymousContext.newPage()
  await anonymousPage.goto(publicUrl)
  await expect(
    anonymousPage.getByRole('heading', { name: 'První cesta' }),
  ).toBeVisible()
  await expect(
    anonymousPage.getByRole('img', { name: 'První cesta' }),
  ).toBeVisible()
  await anonymousContext.close()

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill('Kanada 2026')
  await page
    .getByLabel('Krátký popis')
    .fill('Etapy, místa a praktické poznámky na jednom místě.')
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: 'Kanada 2026' })).toBeVisible()
  await expect(page.getByText('Průběh cesty')).toBeVisible()

  const stageForm = page
    .getByRole('heading', { name: 'Nová etapa' })
    .locator('..')
  await stageForm.getByLabel('Název').fill('Skalnaté hory')
  await stageForm.getByRole('button', { name: 'Přidat' }).click()
  await expect(
    page.getByRole('heading', { name: 'Skalnaté hory' }),
  ).toBeVisible()

  const stopForm = page
    .getByRole('heading', { name: 'Nové místo' })
    .locator('..')
  await stopForm.getByLabel('Název').fill('Banff')
  await stopForm.getByLabel('Zeměpisná šířka').fill('51.1784')
  await stopForm.getByLabel('Zeměpisná délka').fill('-115.5708')
  await stopForm.getByRole('button', { name: 'Přidat' }).click()
  await expect(page.getByText('Banff')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mapa cesty' })).toBeVisible()

  const guideForm = page
    .getByRole('heading', { name: 'Praktická sekce' })
    .locator('..')
  await guideForm.getByLabel('Název').fill('Doprava')
  await guideForm.getByLabel('Poznámky').fill('Tipy pro přesuny po Kanadě.')
  await guideForm.getByRole('button', { name: 'Přidat' }).click()
  await expect(page.getByRole('heading', { name: 'Doprava' })).toBeVisible()

  const publicJourneyContext = await browser.newContext()
  const publicJourneyPage = await publicJourneyContext.newPage()
  await publicJourneyPage.goto(page.url())
  await expect(
    publicJourneyPage.getByRole('heading', { name: 'Kanada 2026' }),
  ).toBeVisible()
  await expect(publicJourneyPage.getByText('Banff')).toBeVisible()
  await expect(
    publicJourneyPage.getByRole('region', { name: 'Mapa cesty' }),
  ).toBeVisible()
  await expect(
    publicJourneyPage.getByRole('heading', { name: 'Doprava' }),
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
