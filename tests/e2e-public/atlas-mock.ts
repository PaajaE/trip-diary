import type { Page } from '@playwright/test'
import { ATLAS, buildAtlasJourney } from './atlas-journey'

export const MOCK_SUPABASE = 'http://supabase.test'
export const MOCK_MEDIA = 'http://media.test'

const TRANSPARENT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const CORS = {
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-allow-origin': '*',
}

function svgFor(url: string): string {
  let hash = 0
  for (const ch of url) hash = (hash * 31 + ch.charCodeAt(0)) % 360
  const [, , w = '4', h = '3'] = /\/(\d+)x(\d+)\//.exec(url) ?? []
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${String(hash)} 45% 62%)"/><stop offset="1" stop-color="hsl(${String((hash + 40) % 360)} 40% 38%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
}

/** Serves the synthetic journey, placeholder images and an empty backend. */
export async function mockPublicBackend(
  page: Page,
  options: { photosPerStop?: number; stopsPerDay?: number } = {},
): Promise<void> {
  const journey = buildAtlasJourney(options)
  await page.route(`${MOCK_SUPABASE}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS, status: 204 })
      return
    }
    if (request.url().includes('/rpc/get_public_journey')) {
      await route.fulfill({
        body: JSON.stringify(journey),
        headers: CORS,
        contentType: 'application/json',
      })
      return
    }
    await route.fulfill({
      body: '[]',
      contentType: 'application/json',
      headers: CORS,
    })
  })
  await page.route(`${MOCK_MEDIA}/**`, async (route) => {
    await route.fulfill({
      body: svgFor(route.request().url()),
      contentType: 'image/svg+xml',
      headers: CORS,
    })
  })
  // Map tiles are not needed (and not reachable) in tests.
  await page.route(/tile\.openstreetmap|api\.mapy\.com|maptiler/, (route) =>
    route.fulfill({
      body: Buffer.from(TRANSPARENT_PNG, 'base64'),
      contentType: 'image/png',
      headers: CORS,
    }),
  )
}

export const atlasUrl = `/${ATLAS.handle}/${ATLAS.slug}`
