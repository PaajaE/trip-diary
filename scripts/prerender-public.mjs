// Prerenders public v2 routes into dist/ after `vite build`.
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (required to run),
//      VITE_SITE_URL, VITE_MEDIA_BASE_URL (optional), PRERENDER_REQUIRED=1 (fail hard).
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { parsePublicJourney } from '@trip-diary/core/public-journey'
import { cs } from '../packages/i18n/src/cs.ts'
import { en } from '../packages/i18n/src/en.ts'
import {
  buildAtomFeed,
  buildPages,
  buildRobots,
  buildSitemap,
  isSafePathSegment,
  renderPage,
  routePreloads,
  serializeJsonForScript,
  smallVariantUrl,
  withLocalVariant,
} from './lib/prerender.mjs'

const required = process.env.PRERENDER_REQUIRED === '1'
const distDir = process.env.PRERENDER_DIST ?? 'dist'
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const siteUrl = process.env.VITE_SITE_URL || undefined
const mediaBaseUrl = process.env.VITE_MEDIA_BASE_URL || undefined
// Same rule as isMapyApiKeyConfigured(): a key selects the Mapy basemap.
const mapyKey = (process.env.VITE_MAPY_API_KEY ?? '').trim()
const mapOrigin = mapyKey === '' ? undefined : 'https://api.mapy.com'
const attributionKey =
  mapyKey === '' ? 'mapAttributionOsm' : 'mapAttributionMapy'
// Texts of the static shell (both languages; chosen by an inline script).
const strings = {
  cs: { ...cs.publicJourney, attribution: cs.reader[attributionKey] },
  en: { ...en.publicJourney, attribution: en.reader[attributionKey] },
}

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

/**
 * Copies the hero's `small` variant next to the page (dist/hero/). Best
 * effort: any failure leaves the remote URL in place.
 */
async function mirrorHero(page) {
  const hero = page.shell?.hero
  const remote = hero === undefined ? null : smallVariantUrl(hero)
  if (remote === null) return null
  try {
    const response = await fetch(remote, {
      signal: AbortSignal.timeout(30_000),
    })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.startsWith('image/'))
      throw new Error(`HTTP ${response.status} ${type}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > 512 * 1024)
      throw new Error(`unexpected size ${bytes.length}`)
    const name = `${createHash('sha256').update(remote).digest('hex').slice(0, 16)}${extname(new URL(remote).pathname)}`
    await mkdir(join(distDir, 'hero'), { recursive: true })
    await writeFile(join(distDir, 'hero', name), bytes)
    const local = withLocalVariant(hero, remote, `/hero/${name}`)
    page.shell = { ...page.shell, hero: local }
    page.hero = local
    return { from: remote, to: `/hero/${name}` }
  } catch (error) {
    console.warn(`prerender: hero not mirrored (${describe(error)})`)
  }
  return null
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

// Stylesheets inlined into journey pages (one render-blocking request less).
const inlineStyles = {}
for (const match of template.matchAll(
  /<link\s+rel="stylesheet"[^>]*\shref="([^"]+)"/g,
)) {
  const href = match[1]
  try {
    inlineStyles[href] = await readFile(
      join(distDir, href.replace(/^\//, '')),
      'utf8',
    )
  } catch {}
}

let manifest = null
try {
  manifest = JSON.parse(
    await readFile(join(distDir, '.vite', 'manifest.json'), 'utf8'),
  )
} catch {}
const base = (process.env.VITE_BASE_PATH ?? '/').replace(/\/+$/, '')
const preload = routePreloads(manifest, {
  base,
  entryFiles: [...template.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) =>
    m[1].slice(base.length + 1),
  ),
  skipCss: Object.keys(inlineStyles),
})

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
    if (siteUrl !== undefined) {
      await mkdir(join(distDir, handle, slug), { recursive: true })
      await writeFile(
        join(distDir, handle, slug, 'feed.xml'),
        buildAtomFeed(tree, {
          handle,
          siteUrl,
          slug,
          updatedAt: row.updated_at,
        }),
      )
    }
    for (const page of pages) {
      if (page.kind === 'journey') {
        // The React hero swaps the same remote URL for the same-origin copy,
        // so the image is downloaded once, not twice.
        const mirror = await mirrorHero(page)
        if (mirror !== null) embed.heroMirror = mirror
      }
      // Journey page: the tree is a separate file, not inlined (HTML size).
      const dataUrl =
        page.kind === 'journey' && page.shell
          ? `${base}/${page.dir}/data.json`
          : undefined
      if (dataUrl !== undefined) {
        await mkdir(join(distDir, page.dir), { recursive: true })
        await writeFile(
          join(distDir, page.dir, 'data.json'),
          serializeJsonForScript(embed),
        )
      }
      await writePage(
        page.dir,
        renderPage(template, page, {
          dataUrl,
          embed,
          inlineStyles,
          mapOrigin,
          mediaBaseUrl,
          preload,
          siteUrl,
          strings,
          supabaseUrl,
        }),
      )
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
