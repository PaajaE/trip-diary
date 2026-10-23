// Pure helpers for scripts/prerender-public.mjs (no I/O, no network).
// Image URL logic mirrors src/entities/public-journey/lib/media-url.ts.
import {
  buildJourneyStats,
  buildMapPreview,
  formatJourneyPeriod,
  MAP_PREVIEW_BACKGROUND,
  mapPreviewSvg,
} from '@trip-diary/core/public-journey'

export const DEFAULT_MEDIA_BASE_URL = 'https://media.cestovni-denik.cz'
export const EMBED_SCRIPT_ID = '__PUBLIC_JOURNEY__'
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const IMAGE_KINDS = ['thumb', 'small', 'medium', 'large']

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** JSON safe inside <script type="application/json">. */
export function serializeJsonForScript(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

export function isSafePathSegment(value) {
  return typeof value === 'string' && SAFE_SEGMENT.test(value)
}

export function trimSlash(value) {
  return value.replace(/\/+$/, '')
}

export function mediaUrl(storageKey, baseUrl = DEFAULT_MEDIA_BASE_URL) {
  return `${trimSlash(baseUrl)}/${storageKey.replace(/^\/+/, '')}`
}

/** First sentence of a text shortened to a title; mirrors firstSentence() in the app. */
export function firstSentence(text, max = 60) {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat === '') return ''
  const end = flat.search(/[.!?…](\s|$)/)
  const sentence = end === -1 ? flat : flat.slice(0, end)
  return sentence.length <= max
    ? sentence
    : `${sentence.slice(0, max - 1).trimEnd()}…`
}

export function summarize(text, max = 160) {
  const flat = String(text ?? '')
    .replace(/[#*_>`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1).trimEnd()}…`
}

function imageVariants(media) {
  return media.variants
    .filter((v) => IMAGE_KINDS.includes(v.kind))
    .sort((a, b) => a.width - b.width)
}

/** { src, srcSet, ogImage } for a media item, or null without image variants. */
export function resolveHero(media, baseUrl = DEFAULT_MEDIA_BASE_URL) {
  if (media === undefined || media === null) return null
  if (media.kind === 'video') {
    const poster = media.variants.find((v) => v.kind === 'poster')
    if (poster === undefined) return null
    const url = mediaUrl(poster.storageKey, baseUrl)
    return {
      alt: media.caption ?? '',
      focalX: media.focalX ?? null,
      focalY: media.focalY ?? null,
      height: poster.height,
      ogImage: url,
      src: url,
      srcSet: '',
      width: poster.width,
    }
  }
  const sorted = imageVariants(media)
  if (sorted.length === 0) return null
  const large =
    sorted.find((v) => v.kind === 'large') ?? sorted[sorted.length - 1]
  // Same fallback as resolveImage() in media-url.ts (medium, else largest).
  const medium =
    sorted.find((v) => v.kind === 'medium') ?? sorted[sorted.length - 1]
  const seen = new Set()
  const parts = []
  for (const v of sorted) {
    if (seen.has(v.width)) continue
    seen.add(v.width)
    parts.push(`${mediaUrl(v.storageKey, baseUrl)} ${String(v.width)}w`)
  }
  return {
    alt: media.caption ?? '',
    focalX: media.focalX ?? null,
    focalY: media.focalY ?? null,
    height: medium.height,
    ogImage: mediaUrl(large.storageKey, baseUrl),
    src: mediaUrl(medium.storageKey, baseUrl),
    srcSet: parts.join(', '),
    width: medium.width,
  }
}

/** Remote URL of the `small` variant listed in a hero's srcset, or null. */
export function smallVariantUrl(hero) {
  const match = /(?:^|,\s*)(\S+\/small\.[A-Za-z0-9]+)\s+\d+w/.exec(hero.srcSet)
  return match?.[1] ?? null
}

/**
 * Same hero, with one remote image URL swapped for a same-origin copy. The
 * image then reuses the already-open connection to the page's own origin
 * instead of paying DNS + TCP + TLS for the media host before the LCP paint.
 * `ogImage` stays absolute (crawlers need it).
 */
export function withLocalVariant(hero, remoteUrl, localUrl) {
  const swap = (value) => value.split(remoteUrl).join(localUrl)
  return { ...hero, src: swap(hero.src), srcSet: swap(hero.srcSet) }
}

export function pathsFor(handle, slug) {
  return `/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`
}

/** Describes every page of one journey: url path, output dir (relative), meta. */
export function buildPages(tree, { handle, slug, mediaBaseUrl }) {
  const base = pathsFor(handle, slug)
  const mediaById = new Map(tree.media.map((m) => [m.id, m]))
  const heroOf = (coverId, fallbackMedia) => {
    const cover = coverId === null ? undefined : mediaById.get(coverId)
    const candidates = [
      cover,
      ...fallbackMedia,
      ...tree.media.filter((m) => m.starred),
    ]
    for (const media of candidates) {
      const hero = resolveHero(media, mediaBaseUrl)
      if (hero !== null) return hero
    }
    return null
  }
  const j = tree.journey
  const site = j.space.name
  // Exactly what PublicJourneyPage shows as its hero (pickCover): the cover,
  // else the first starred photo, else the first photo. The static shell must
  // match it, so it is derived separately from the OG/preload candidates.
  const photos = tree.media.filter((m) => m.kind === 'photo')
  const coverMedia =
    j.coverMediaId === null ? undefined : mediaById.get(j.coverMediaId)
  const shellMedia = coverMedia ?? photos.find((m) => m.starred) ?? photos[0]
  const shellHero = resolveHero(shellMedia, mediaBaseUrl)
  const firstStage = tree.segments
    .filter((x) => x.kind === 'stage' && isSafePathSegment(x.id))
    .sort((a, b) => a.position - b.position)[0]
  const pages = [
    {
      description: summarize(j.summary) || `${j.title} · ${site}`,
      dir: `${handle}/${slug}`,
      hero: shellHero ?? heroOf(j.coverMediaId, []),
      kind: 'journey',
      shell:
        shellHero === null
          ? null
          : {
              eyebrow: site,
              hero: shellHero,
              mapPreview: buildMapPreview(tree),
              periods: {
                cs: formatJourneyPeriod(j.startsAt, j.endsAt, 'cs'),
                en: formatJourneyPeriod(j.startsAt, j.endsAt, 'en'),
              },
              startPath:
                firstStage === undefined ? null : `${base}/e/${firstStage.id}`,
              stats: buildJourneyStats(tree),
              status: j.status,
              summary: j.summary,
              title: j.title,
            },
      title: `${j.title} · ${site}`,
      urlPath: base,
    },
  ]
  for (const s of tree.segments) {
    if (!isSafePathSegment(s.id)) continue
    pages.push({
      description: summarize(s.body) || `${s.title} · ${j.title}`,
      dir: `${handle}/${slug}/e/${s.id}`,
      hero: heroOf(
        s.coverMediaId,
        tree.media.filter((m) => m.segmentOverrideId === s.id),
      ),
      kind: 'segment',
      title: `${s.title} · ${j.title}`,
      urlPath: `${base}/e/${s.id}`,
    })
  }
  for (const m of tree.moments) {
    if (!isSafePathSegment(m.id)) continue
    // Same fallback as publicMomentTitle(): title, first sentence, journey.
    const own = (m.title ?? '').trim() || firstSentence(m.body)
    const title = own || j.title
    pages.push({
      description: summarize(m.body) || `${title} · ${j.title}`,
      dir: `${handle}/${slug}/m/${m.id}`,
      hero: heroOf(
        m.coverMediaId,
        tree.media.filter((x) => x.momentId === m.id),
      ),
      kind: 'moment',
      title: own === '' ? j.title : `${own} · ${j.title}`,
      urlPath: `${base}/m/${m.id}`,
    })
  }
  return pages
}

const REPLACED_HEAD = [
  /<title>[\s\S]*?<\/title>\s*/i,
  /<meta\s+name="description"[^>]*>\s*/i,
  /<meta\s+property="og:(?:title|description|image|url|type)"[^>]*>\s*/gi,
  /<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/gi,
]

/** Renders one prerendered page from the built dist/index.html. */
export function renderPage(
  template,
  page,
  {
    embed,
    dataUrl,
    inlineStyles = {},
    mapOrigin,
    mediaBaseUrl,
    preload,
    siteUrl,
    strings,
    supabaseUrl,
  },
) {
  let html = template
  for (const pattern of REPLACED_HEAD) html = html.replace(pattern, '')
  const canonical =
    siteUrl === undefined ? null : `${trimSlash(siteUrl)}${page.urlPath}`
  const title = escapeHtml(page.title)
  const description = escapeHtml(page.description)
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    canonical === null
      ? null
      : `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    canonical === null
      ? null
      : `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    page.hero === null
      ? null
      : `<meta property="og:image" content="${escapeHtml(page.hero.ogImage)}" />`,
    `<meta name="twitter:card" content="${page.hero === null ? 'summary' : 'summary_large_image'}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    page.hero === null
      ? null
      : `<meta name="twitter:image" content="${escapeHtml(page.hero.ogImage)}" />`,
    page.hero === null ? null : preloadTag(page.hero),
    ...originHints({ mapOrigin, mediaBaseUrl, supabaseUrl }),
  ].filter((t) => t !== null)
  const block = `    ${tags.join('\n    ')}\n  </head>`
  // Replacer function: a string would interpret $$, $&, $' and $` in user text.
  html = html.replace('</head>', () => block)
  const shell =
    page.shell === undefined || page.shell === null
      ? null
      : shellHtml(page.shell, strings)
  const embedTag = `<script type="application/json" id="${EMBED_SCRIPT_ID}">${serializeJsonForScript(embed)}</script>`
  let tail = embedTag
  let loader = ''
  if (shell !== null) {
    // The hero is static: let it (and the CSS) have the whole connection, and
    // boot the app only once the hero image has loaded.
    const boot = []
    html = html.replace(
      /\s*<script\s+type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g,
      (_, src) => {
        boot.push(src)
        return ''
      },
    )
    html = html.replace(/\s*<link\s+rel="modulepreload"[^>]*>/g, '')
    html = html.replace(
      /<link\s+rel="stylesheet"[^>]*\shref="([^"]+)"[^>]*>/g,
      (tag, href) => {
        const css = inlineStyles[href]
        // The disabled link is never fetched but still matches the lookup of
        // Vite's dynamic-import helper, so lazy chunks do not download the
        // stylesheet a second time.
        return css === undefined
          ? tag
          : `<style>${css.replaceAll('</style', '<\\/style')}</style><link rel="stylesheet" href="${href}" disabled />`
      },
    )
    if (dataUrl === undefined) {
      tail = `${embedTag}\n    ${bootScript(boot, preload)}`
    } else {
      // The tree is a separate file (page-data): inline it would put the HTML
      // above one TCP initial window (~14 KB) and cost a round trip on the LCP
      // path. The loader fills the same element the app reads.
      tail = ''
      loader = `\n    ${bootScript(boot, preload, dataUrl)}`
    }
  }
  // vite.config.ts (landingShell) fills #root with the landing hero; it does
  // not belong on journey pages, so replace the whole root element.
  const root =
    shell === null
      ? '<div id="root"></div>'
      : `${shell}\n    <div id="root" hidden></div>${loader}`
  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>(?=\s*<script>)|<div id="root"><\/div>/,
    () => root,
  )
  return html.replace('</body>', () => `    ${tail}\n  </body>`)
}

/**
 * Inline loader: appends the app's module scripts once the hero image has
 * loaded (or failed, or after 4 s), so the bundle never competes with the LCP
 * image. Without a hero image it boots at once. `preload` (chunks the public
 * route needs next, see routePreloads) is requested in the same moment, so
 * they download in parallel with the app chunk instead of after it runs.
 */
export function bootScript(srcs, preload = { css: [], js: [] }, dataUrl) {
  const hints = [
    ...preload.js.map((href) => ['modulepreload', href, '']),
    ...preload.css.map((href) => ['preload', href, 'style']),
  ]
  // dataUrl: fetch the journey tree now (it is tiny next to the hero) and put
  // it into the element readEmbeddedJourney() reads. The app is started only
  // after the tree arrived (or after 1.5 s; the app then fetches it itself).
  const data =
    dataUrl === undefined
      ? ''
      : `var d=fetch(${serializeJsonForScript(dataUrl)}).then(function(r){return r.ok?r.text():''}).then(function(t){if(t){var e=document.createElement('script');e.type='application/json';e.id='${EMBED_SCRIPT_ID}';e.textContent=t;document.body.appendChild(e)}}).catch(function(){});`
  const wait =
    dataUrl === undefined
      ? 'start()'
      : 'Promise.race([d,new Promise(function(r){setTimeout(r,1500)})]).then(start)'
  return `<script>(function(){${data}var s=${serializeJsonForScript(srcs)},h=${serializeJsonForScript(hints)},b=0;function start(){for(var j=0;j<h.length;j++){var l=document.createElement('link');l.rel=h[j][0];l.crossOrigin='';l.href=h[j][1];if(h[j][2])l.as=h[j][2];document.head.appendChild(l)}for(var k=0;k<s.length;k++){var e=document.createElement('script');e.type='module';e.crossOrigin='anonymous';e.src=s[k];document.head.appendChild(e)}}function go(){if(b)return;b=1;${wait}}var i=document.querySelector('#${SHELL_ID} img');if(!i||i.complete){go();return}i.addEventListener('load',go);i.addEventListener('error',go);setTimeout(go,4000)})()</script>`
}

/**
 * Static hero painted before the JS bundle runs. Mirrors the hero block of
 * src/pages/public-journey/PublicJourneyPage.tsx (classes, sizes, dimensions);
 * keep both in sync. Removed by releasePrerenderShell() once React has rendered.
 */
export const HERO_SIZES = '100vw'
export const SHELL_ID = 'prerender-shell'

/**
 * Both languages are in the markup; this picks one before first paint with the
 * same rule as detectBrowserLocale()/readStoredLocale() in src/app/locale-preference.ts.
 */
const LOCALE_SCRIPT = `<script>(function(){var l;try{l=localStorage.getItem('trip-diary.locale')}catch(e){}if(l!=='cs'&&l!=='en'){l='en';var a=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''];for(var i=0;i<a.length;i++){var b=String(a[i]).toLowerCase().split('-')[0];if(b==='cs'||b==='sk'){l='cs';break}if(b==='en')break}}var n=document.querySelectorAll('#${SHELL_ID} [data-l]');for(var k=0;k<n.length;k++)n[k].hidden=n[k].getAttribute('data-l')!==l})()</script>`

function bilingual(strings, key) {
  return ['cs', 'en']
    .map(
      (l) =>
        `<span data-l="${l}"${l === 'cs' ? '' : ' hidden'}>${escapeHtml(strings[l][key])}</span>`,
    )
    .join('')
}

/**
 * Route section: heading, hint, strip-sized gap and the map-sized placeholder
 * (tone of the real map, pins and route from the data), so the first
 * viewport is visually complete before MapLibre. Mirrors the route section of
 * PublicJourneyPage and PublicMapSection.
 */
function routeSectionHtml(mapPreview, strings) {
  const box =
    mapPreview === null || mapPreview === undefined ? 'bg-surface' : ''
  const tone =
    mapPreview === null || mapPreview === undefined
      ? ''
      : ` style="background:${MAP_PREVIEW_BACKGROUND}"`
  const svg =
    mapPreview === null || mapPreview === undefined
      ? ''
      : mapPreviewSvg(mapPreview)
  return `<section aria-labelledby="route-heading-shell" class="scroll-mt-16 space-y-4" id="route"><div><h2 class="reader-display text-3xl" id="route-heading-shell">${bilingual(strings, 'route')}</h2><p class="mt-1 text-sm text-muted">${bilingual(strings, 'routeHint')}</p></div><div class="h-1.5"></div><div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]"><section><div aria-hidden="true" class="relative h-[22rem] w-full overflow-hidden rounded-lg border border-border ${box} sm:h-[28rem]"${tone}>${svg}</div><p class="mt-3 text-xs leading-5 text-muted">${bilingual(strings, 'attribution')}</p></section></div></section>`
}

const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold'

/** Same text in both languages, picked by the locale script. */
function bilingualText(texts) {
  return ['cs', 'en']
    .map(
      (l) =>
        `<span data-l="${l}"${l === 'cs' ? '' : ' hidden'}>${escapeHtml(texts[l] ?? '')}</span>`,
    )
    .join('')
}

function statsHtml(stats, strings) {
  const items = [
    ['statDays', String(stats.days)],
    ...(stats.stages > 0 ? [['statStages', String(stats.stages)]] : []),
    ...(stats.distanceKm > 0
      ? [['statRoute', `${String(stats.distanceKm)} km`]]
      : []),
    ...(stats.media > 0 ? [['statMedia', String(stats.media)]] : []),
  ]
  return `<dl class="flex flex-wrap gap-x-6 gap-y-2">${items
    .map(
      ([key, value]) =>
        `<div class="flex flex-col-reverse"><dt class="text-xs text-white/80">${bilingual(strings, key)}</dt><dd class="reader-display text-xl tabular-nums text-white">${escapeHtml(value)}</dd></div>`,
    )
    .join('')}</dl>`
}

const STATUS_KEYS = {
  active: 'statusActive',
  completed: 'statusCompleted',
  planning: 'statusPlanning',
}

/**
 * Static cover painted before the JS bundle runs. Mirrors JourneyHero and the
 * route section of PublicJourneyPage (classes, sizes, dimensions); keep both
 * in sync. Removed by releasePrerenderShell() once React has rendered.
 */
export function shellHtml(
  {
    eyebrow,
    hero,
    mapPreview,
    periods,
    startPath,
    stats,
    status,
    summary,
    title,
  },
  strings,
) {
  const focal =
    hero.focalX !== null && hero.focalY !== null
      ? ` style="object-position:${String(hero.focalX * 100)}% ${String(hero.focalY * 100)}%"`
      : ''
  const srcset =
    hero.srcSet === '' ? '' : ` srcset="${escapeHtml(hero.srcSet)}"`
  const img = `<img alt="${escapeHtml(hero.alt)}" class="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_30%]" decoding="async" fetchpriority="high" height="${String(hero.height)}" loading="eager" sizes="${HERO_SIZES}" src="${escapeHtml(hero.src)}"${srcset}${focal} width="${String(hero.width)}" />`
  const statusKey = STATUS_KEYS[status]
  const eyebrowHtml =
    strings === undefined || statusKey === undefined
      ? escapeHtml(eyebrow)
      : bilingualText({
          cs: `${strings.cs[statusKey]} · ${eyebrow}`,
          en: `${strings.en[statusKey]} · ${eyebrow}`,
        })
  const period =
    periods === undefined || periods === null || periods.cs === null
      ? null
      : `<p class="text-sm text-white/90">${bilingualText(periods)}</p>`
  const start =
    strings === undefined || startPath === null || startPath === undefined
      ? ''
      : `<a class="${BUTTON} bg-primary text-primary-foreground" href="${escapeHtml(startPath)}">${bilingual(strings, 'startReading')}</a>`
  const lines = [
    `<p class="text-xs font-semibold tracking-[0.14em] uppercase text-white/85">${eyebrowHtml}</p>`,
    `<h1 class="reader-display text-4xl leading-[1.05] sm:text-6xl">${escapeHtml(title)}</h1>`,
    period,
    strings === undefined || stats === undefined
      ? null
      : statsHtml(stats, strings),
    start === ''
      ? null
      : `<div class="flex flex-wrap gap-2 pt-1">${start}</div>`,
  ].filter((l) => l !== null)
  const header = `<header class="relative isolate flex h-[clamp(22rem,46vw,36rem)] items-end overflow-hidden bg-primary text-white">${img}<div class="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-transparent"></div><div class="mx-auto w-full max-w-6xl space-y-3 px-5 pb-8 sm:pb-10">${lines.join('')}</div></header>`
  const body =
    strings === undefined
      ? ''
      : `<div class="h-[53px] border-b border-border"></div><div class="mx-auto max-w-6xl space-y-14 px-5 py-10">${summary === '' ? '' : `<p class="reader-body max-w-[65ch] whitespace-pre-line text-lg leading-8">${escapeHtml(summary)}</p>`}${mapPreview === null || mapPreview === undefined ? '' : routeSectionHtml(mapPreview, strings)}</div>`
  return `<div id="${SHELL_ID}"><main>${header}${body}</main>${strings === undefined ? '' : LOCALE_SCRIPT}</div>`
}

function originOf(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * preconnect hints. Images are fetched without CORS (no crossorigin attribute,
 * so the connection is reusable); the API origin is used by fetch() with CORS.
 */
function originHints({ mapOrigin, mediaBaseUrl, supabaseUrl }) {
  const media = originOf(mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL)
  const api = supabaseUrl === undefined ? null : originOf(supabaseUrl)
  const map = mapOrigin === undefined ? null : originOf(mapOrigin)
  return [
    media === null ? null : `<link rel="preconnect" href="${media}" />`,
    api === null || api === media
      ? null
      : `<link rel="preconnect" href="${api}" crossorigin />`,
    map === null ? null : `<link rel="preconnect" href="${map}" crossorigin />`,
  ].filter((t) => t !== null)
}

function preloadTag(hero) {
  const srcset =
    hero.srcSet === ''
      ? ''
      : ` imagesrcset="${escapeHtml(hero.srcSet)}" imagesizes="${HERO_SIZES}"`
  return `<link rel="preload" as="image" fetchpriority="high" href="${escapeHtml(hero.src)}"${srcset} />`
}

export function buildSitemap(entries, siteUrl) {
  const site = trimSlash(siteUrl)
  const urls = entries
    .map(({ lastmod, urlPath }) => {
      const mod =
        lastmod === undefined ||
        lastmod === null ||
        Number.isNaN(Date.parse(lastmod))
          ? ''
          : `<lastmod>${new Date(lastmod).toISOString()}</lastmod>`
      return `  <url><loc>${escapeHtml(site + urlPath)}</loc>${mod}</url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function buildRobots(source, siteUrl) {
  const base = source.endsWith('\n') ? source : `${source}\n`
  if (siteUrl === undefined) return base
  return `${base.replace(/^Sitemap:.*\n?/gim, '')}Sitemap: ${trimSlash(siteUrl)}/sitemap.xml\n`
}

/**
 * Chunks (and CSS) the public journey route needs right after the entry chunk
 * runs: the lazy route chunk, its static imports, and the lazy map chunk with
 * MapLibre. From Vite's build manifest; anything unexpected gives an empty
 * result (no preload hints, the app then just loads them on demand).
 * `entryFiles` (manifest-relative, requested by the page anyway) and `skipCss`
 * (inlined stylesheets) are left out.
 */
export function routePreloads(
  manifest,
  { base = '/', entryFiles = [], skipCss = [] } = {},
) {
  const none = { css: [], js: [] }
  if (manifest === null || typeof manifest !== 'object') return none
  const route = Object.values(manifest).find(
    (c) => c?.src === 'src/pages/public-journey/PublicJourneyRoutePages.tsx',
  )
  if (route === undefined) return none
  // Already requested by the boot script itself.
  const skip = new Set(entryFiles)
  const js = new Set()
  const css = new Set()
  const visit = (chunk, depth) => {
    if (chunk === undefined || skip.has(chunk.file) || js.has(chunk.file))
      return
    js.add(chunk.file)
    for (const file of chunk.css ?? []) css.add(file)
    for (const key of chunk.imports ?? []) visit(manifest[key], depth)
    // The lazy map chunk is the only dynamic import worth fetching early.
    if (depth === 0) {
      for (const key of chunk.dynamicImports ?? []) {
        if (/PublicJourneyMap\.tsx$/.test(key)) visit(manifest[key], depth + 1)
      }
    }
  }
  visit(route, 0)
  const url = (file) => `${base.replace(/\/+$/, '')}/${file}`
  return {
    css: [...css].filter((f) => !skipCss.includes(url(f))).map(url),
    js: [...js].map(url),
  }
}
