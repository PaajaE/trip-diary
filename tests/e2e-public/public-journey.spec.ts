import { expect, test } from '@playwright/test'
import { atlasUrl, mockPublicBackend } from './atlas-mock'

const noOverflow = async (page: import('@playwright/test').Page) => {
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - window.innerWidth',
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test('journey -> stage -> moment -> lightbox -> back', async ({ page }) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dolomity pěšky, 2025' }),
  ).toBeVisible()
  await noOverflow(page)

  // Journey -> stage (first chapter).
  await page.getByRole('link', { name: 'Začít číst' }).click()
  await expect(page).toHaveURL(/\/e\/[^/]+$/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Přílet a první kroky' }),
  ).toBeVisible()
  await expect(page.locator('[data-day]')).toHaveCount(3)
  await noOverflow(page)

  // Stage -> moment (a stop of the first day).
  await page
    .locator('[data-day]')
    .first()
    .getByRole('list', { name: 'Zastávky dne' })
    .getByRole('link')
    .first()
    .click()
  await expect(page).toHaveURL(/\/m\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/Zastávka 1 z 9/)).toBeVisible()
  await noOverflow(page)

  // Moment -> lightbox: counter, arrows, Esc, focus returns to the opener.
  const hero = page.getByRole('button', { name: 'Otevřít fotku' }).first()
  await hero.click()
  const dialog = page.getByRole('dialog', { name: 'Prohlížeč fotek' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('status')).toHaveText('1 / 4')
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('status')).toHaveText('2 / 4')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(hero).toBeFocused()

  // Back: moment -> stage -> journey.
  await page.goBack()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Přílet a první kroky' }),
  ).toBeVisible()
  await page.goBack()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dolomity pěšky, 2025' }),
  ).toBeVisible()
})

test('lightbox swipes between photos', async ({ page }) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  await page.getByRole('link', { name: 'Začít číst' }).click()
  await page
    .locator('[data-day]')
    .first()
    .getByRole('button', { name: 'Otevřít fotku' })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Prohlížeč fotek' })
  await expect(dialog.getByRole('status')).toHaveText(/^1 \/ \d+$/)
  const box = await dialog.getByRole('figure').boundingBox()
  if (box === null) throw new Error('no figure')
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * 0.8, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 5 })
  await page.mouse.up()
  await expect(dialog.getByRole('status')).toHaveText(/^2 \/ \d+$/)
})

test("a day without the author's words folds into one line and opens on tap", async ({
  page,
}) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  await page.getByRole('link', { name: 'Začít číst' }).click()
  const folded = page.locator('details[data-day]')
  await expect(folded).toHaveCount(1)
  await expect(folded).not.toHaveAttribute('open', '')
  await expect(folded.locator('summary')).toContainText('zastávky')
  // Closed: the day's photos are not on screen; open: they are.
  await expect(folded.getByRole('list', { name: 'Zastávky dne' })).toBeHidden()
  await folded.locator('summary').click()
  await expect(folded.getByRole('list', { name: 'Zastávky dne' })).toBeVisible()
})

test('the journey page offers to continue where this reader stopped', async ({
  page,
}) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  await expect(page.getByRole('link', { name: 'Začít číst' })).toBeVisible()
  await page.getByRole('link', { name: 'Začít číst' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Přílet a první kroky' }),
  ).toBeVisible()
  await page.locator('[data-day]').nth(1).waitFor()
  await page.evaluate(
    "document.querySelectorAll('[data-day]')[1]?.scrollIntoView({ block: 'start' })",
  )
  // The position is saved once the reader settles on a day.
  await page.waitForTimeout(1500)
  await page.goBack()
  const resume = page.getByRole('link', {
    name: 'Pokračovat tam, kde jsi skončil',
  })
  await expect(resume).toBeVisible()
  await expect(page.getByRole('link', { name: 'Začít číst' })).toHaveCount(0)
  await resume.click()
  await expect(page).toHaveURL(/\/e\/[^/#]+#day-\d{4}-\d{2}-\d{2}$/)
})

test('a mobile reader gets a greeting bar that jumps to the comments', async ({
  page,
}, testInfo) => {
  await mockPublicBackend(page)
  await page.goto(atlasUrl)
  const bar = page.getByTestId('greet-authors')
  if (testInfo.project.name === 'desktop') {
    await expect(bar).toBeHidden()
    return
  }
  await expect(bar).toBeVisible()
  await expect(page.getByTestId('follow-news')).toHaveAttribute(
    'href',
    /\/feed\.xml$/,
  )
  await bar.click()
  await expect(page.locator('#comments')).toBeInViewport()
  await noOverflow(page)
})
