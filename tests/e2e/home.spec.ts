import { expect, test } from '@playwright/test'

test('shows the primary capture action', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('link', { name: 'Přidat vzpomínku' }),
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

  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('link', { name: 'Přidat vzpomínku' }),
  ).toBeVisible()

  await page.goto(`/u/${username}`)
  await expect(page.getByRole('heading', { name: username })).toBeVisible()

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
  await stopForm.getByRole('button', { name: 'Přidat' }).click()
  await expect(page.getByText('Banff')).toBeVisible()

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
    publicJourneyPage.getByRole('heading', { name: 'Doprava' }),
  ).toBeVisible()
  await publicJourneyContext.close()
})
