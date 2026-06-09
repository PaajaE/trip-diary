import { expect, test } from '@playwright/test'

test('shows the primary capture action', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('button', { name: 'Přidat vzpomínku' }),
  ).toBeVisible()
})

test('creates an account through local Supabase', async ({ page }) => {
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
    page.getByRole('button', { name: 'Přidat vzpomínku' }),
  ).toBeVisible()

  await page.goto(`/u/${username}`)
  await expect(page.getByRole('heading', { name: username })).toBeVisible()
})
