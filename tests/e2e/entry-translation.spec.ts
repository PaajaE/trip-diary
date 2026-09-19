import { expect, test } from '@playwright/test'
import {
  waitForFullySynced,
  waitForRemoteEntriesByTitle,
} from './helpers/e2e-sync'

test('Czech moment can be translated to English with mock provider', async ({
  page,
}) => {
  test.setTimeout(180_000)

  const unique = crypto.randomUUID().slice(0, 8)
  const journeyTitle = `Překlad cesta ${unique}`
  const momentTitle = `Překlad moment ${unique}`
  const momentBody = `Český příběh pro překlad ${unique}.`
  const editedTitle = `[en] Edited title ${unique}`
  const editedBody = `[en] Edited body ${unique}.`

  await page.goto('/sign-up')
  await page.getByLabel('E-mail').fill(`translate-${unique}@example.test`)
  await page.getByLabel('Uživatelské jméno').fill(`translate_${unique}`)
  await page.getByLabel('Heslo', { exact: true }).fill('StrongPass1')
  await page.getByLabel('Potvrzení hesla').fill('StrongPass1')
  await page.getByRole('button', { name: 'Vytvořit účet' }).click()
  await expect(page).toHaveURL('/dashboard', { timeout: 30_000 })

  await page.goto('/journeys/new')
  await page.getByLabel('Název cesty').fill(journeyTitle)
  await page
    .getByLabel('Krátký popis')
    .fill('E2E smoke pro překlad momentu do angličtiny.')
  await page.getByRole('button', { name: 'Vytvořit cestu' }).click()
  await expect(page.getByRole('heading', { name: journeyTitle })).toBeVisible()

  const journeyUrlMatch = /\/j\/([^/?]+)/.exec(page.url())
  const journeyId = journeyUrlMatch?.[1]
  if (journeyId === undefined) {
    throw new Error('Expected journey URL after create')
  }

  await page.goto(`/j/${journeyId}/memory/new`)
  await expect(
    page.getByRole('heading', { name: 'Přidat moment do cesty' }),
  ).toBeVisible()
  await page.getByLabel('Název', { exact: true }).fill(momentTitle)
  await page.getByLabel('Příběh').fill(momentBody)
  await page.getByRole('button', { name: 'Uložit moment do cesty' }).click()

  await expect(page).toHaveURL(new RegExp(`/j/${journeyId}`), {
    timeout: 30_000,
  })
  await expect(
    page.getByRole('heading', { name: momentTitle, level: 4 }),
  ).toBeVisible({ timeout: 30_000 })

  await waitForFullySynced(page)
  await waitForRemoteEntriesByTitle([momentTitle])

  const momentCard = page.locator('#story article[data-entry-id]').filter({
    has: page.getByRole('heading', { name: momentTitle, level: 4 }),
  })
  await momentCard.getByRole('heading', { name: momentTitle, level: 4 }).click()
  await expect(page).toHaveURL(/\/e\//, { timeout: 20_000 })

  const translationPanel = page.getByRole('region', {
    name: 'Anglický překlad',
  })
  await expect(translationPanel).toBeVisible()
  await expect(
    translationPanel.getByTestId('entry-translation-status'),
  ).toHaveText('Zatím nepřeloženo')

  await translationPanel
    .getByRole('button', { name: /Přeložit do angličtiny/ })
    .click()

  await expect(translationPanel.getByRole('alert')).toHaveCount(0)
  await expect(
    translationPanel.getByTestId('entry-translation-status'),
  ).toHaveText('Překlad je připraven', { timeout: 30_000 })

  await expect(translationPanel.getByLabel('Anglický název')).toHaveValue(
    `[en] ${momentTitle}`,
  )
  await expect(translationPanel.getByLabel('Anglický text')).toHaveValue(
    `[en] ${momentBody}`,
  )

  await translationPanel.getByLabel('Anglický název').fill(editedTitle)
  await translationPanel.getByLabel('Anglický text').fill(editedBody)
  await translationPanel
    .getByRole('button', { name: 'Uložit úpravy' })
    .click()

  await expect(
    translationPanel.getByText(
      'Ruční úpravy se ukládají k tvému účtu. Nové vygenerování je může přepsat.',
    ),
  ).toBeVisible()
  await expect(
    translationPanel.getByText(
      'Nové vygenerování přepíše ruční úpravy anglického textu.',
    ),
  ).toBeVisible({ timeout: 15_000 })

  await page.reload()
  await expect(page.getByRole('heading', { name: momentTitle })).toBeVisible({
    timeout: 30_000,
  })

  const reloadedPanel = page.getByRole('region', { name: 'Anglický překlad' })
  await expect(reloadedPanel.getByLabel('Anglický název')).toHaveValue(
    editedTitle,
    { timeout: 20_000 },
  )
  await expect(reloadedPanel.getByLabel('Anglický text')).toHaveValue(
    editedBody,
  )
  await expect(
    reloadedPanel.getByText(
      'Nové vygenerování přepíše ruční úpravy anglického textu.',
    ),
  ).toBeVisible()
})
