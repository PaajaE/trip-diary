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
  await page.getByRole('button', { name: 'Uložit a publikovat' }).click()
  await expect(page.getByRole('heading', { name: 'První cesta' })).toBeVisible()

  const publicUrl = page.url()
  const anonymousContext = await browser.newContext()
  const anonymousPage = await anonymousContext.newPage()
  await anonymousPage.goto(publicUrl)
  await expect(
    anonymousPage.getByRole('heading', { name: 'První cesta' }),
  ).toBeVisible()
  await anonymousContext.close()
})
