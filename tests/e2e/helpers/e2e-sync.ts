import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

export function readLocalSupabaseEnv(): {
  serviceRoleKey: string
  url: string
} {
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

export function createAdminClient() {
  const { serviceRoleKey, url } = readLocalSupabaseEnv()
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Wait until moment cards report a fully synced queue — not merely "not failed". */
export async function waitForFullySynced(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const momentCards = await page.locator('#story article').count()
        const synced = await page
          .getByLabel('Synchronizováno', { exact: true })
          .count()
        const syncing = await page
          .getByLabel('Synchronizuje se…', { exact: true })
          .count()
        const pending = await page
          .getByLabel('Uloženo lokálně · čeká na synchronizaci', {
            exact: true,
          })
          .count()
        const failed = await page
          .getByRole('button', { name: /Synchronizace selhala/i })
          .count()
        const queueClear = syncing === 0 && pending === 0 && failed === 0
        if (momentCards === 0) {
          return queueClear
        }
        return synced >= momentCards && queueClear
      },
      { timeout: 90_000 },
    )
    .toBe(true)
}

export async function waitForRemoteEntriesByTitle(
  titles: readonly string[],
): Promise<void> {
  const admin = createAdminClient()
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('entries')
          .select('id, title')
          .in('title', [...titles])
        if (error !== null) {
          throw error
        }
        return data?.length ?? 0
      },
      { timeout: 90_000 },
    )
    .toBe(titles.length)
}

export async function waitForPublicJourneyPath(
  journeyId: string,
): Promise<string> {
  const admin = createAdminClient()
  let path = ''
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('journeys')
          .select('slug, spaces!inner(handle)')
          .eq('id', journeyId)
          .eq('visibility', 'public')
          .maybeSingle()
        if (error !== null) {
          throw error
        }
        if (data?.slug == null) {
          return null
        }
        const space = data.spaces as { handle: string } | { handle: string }[]
        const handle = Array.isArray(space) ? space[0]?.handle : space.handle
        if (handle === undefined) {
          return null
        }
        path = `/${handle}/${data.slug}`
        return path
      },
      { timeout: 90_000 },
    )
    .not.toBeNull()
  return path
}

export async function momentTitlesOnPage(
  page: Page,
  unique: string,
): Promise<string[]> {
  const storyTitles = await page
    .locator('#story article h4, .reader-moment-card h4')
    .allTextContents()
  return storyTitles
    .map((title) => title.trim())
    .filter((title) => title.includes(unique))
}
