// Prerenders public v2 routes into dist/ after `vite build`.
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (required to run),
//      VITE_SITE_URL, VITE_MEDIA_BASE_URL (optional), PRERENDER_REQUIRED=1 (fail hard).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parsePublicJourney } from '@trip-diary/core/public-journey'
import {
  buildPages,
  buildRobots,
  buildSitemap,
  isSafePathSegment,
  renderPage,
} from './lib/prerender.mjs'

const required = process.env.PRERENDER_REQUIRED === '1'
const distDir = process.env.PRERENDER_DIST ?? 'dist'
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const siteUrl = process.env.VITE_SITE_URL || undefined
const mediaBaseUrl = process.env.VITE_MEDIA_BASE_URL || undefined

function describe(error) {
  if (error?.name === 'ZodError')
    return `invalid payload (${error.issues.length} issues)`
  return error instanceof Error ? error.message : String(error)
}

function bail(message) {
  if (required) {
    console.error(`prerender: ${message}`)
    process.exit(1)
  }
  console.warn(`prerender: skipped (${message})`)
  process.exit(0)
}

async function rpc(name, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    body: JSON.stringify(body),
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${name} -> HTTP ${response.status}`)
  return response.json()
}

async function writePage(relDir, html) {
  const file = join(distDir, relDir, 'index.html')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, html)
}

if (!supabaseUrl || !anonKey)
  bail('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing')

let template
try {
  template = await readFile(join(distDir, 'index.html'), 'utf8')
} catch {
  bail(`${distDir}/index.html not found (run vite build first)`)
}

let list
try {
  list = await rpc('list_public_journey_paths', {})
  if (!Array.isArray(list)) throw new Error('unexpected list response')
} catch (error) {
  bail(
    `cannot list journeys: ${error instanceof Error ? error.message : error}`,
  )
}

const sitemap = []
let failures = 0
let written = 0
for (const row of list) {
  const handle = row?.space_handle
  const slug = row?.journey_slug
  try {
    if (!isSafePathSegment(handle) || !isSafePathSegment(slug)) {
      throw new Error('unsafe handle/slug')
    }
    const tree = parsePublicJourney(
      await rpc('get_public_journey', {
        p_journey_slug: slug,
        p_space_handle: handle,
      }),
    )
    if (tree === null) throw new Error('journey not public')
    const embed = { journey: tree, journeySlug: slug, spaceHandle: handle }
    const options = { handle, mediaBaseUrl, slug }
    const pages = buildPages(tree, options)
    for (const page of pages) {
      await writePage(page.dir, renderPage(template, page, { embed, siteUrl }))
      sitemap.push({ lastmod: row.updated_at, urlPath: page.urlPath })
      written += 1
    }
  } catch (error) {
    failures += 1
    console.error(
      `prerender: ${String(handle)}/${String(slug)} failed: ${describe(error)}`,
    )
  }
}

if (siteUrl !== undefined) {
  if (sitemap.length > 0) {
    await writeFile(
      join(distDir, 'sitemap.xml'),
      buildSitemap(sitemap, siteUrl),
    )
  }
  let robots = 'User-agent: *\nAllow: /\n'
  try {
    robots = await readFile('public/robots.txt', 'utf8')
  } catch {}
  await writeFile(join(distDir, 'robots.txt'), buildRobots(robots, siteUrl))
} else {
  console.warn('prerender: VITE_SITE_URL unset; no sitemap, robots, canonical')
}

console.log(
  `prerender: ${written} pages from ${list.length - failures}/${list.length} journeys`,
)
if (failures > 0 && required) process.exit(1)
