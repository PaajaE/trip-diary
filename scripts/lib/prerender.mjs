// Pure helpers for scripts/prerender-public.mjs (no I/O, no network).
// Image URL logic mirrors src/entities/public-journey/lib/media-url.ts.

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
              period:
                j.startsAt === null
                  ? null
                  : `${j.startsAt}${j.endsAt === null ? '' : ` – ${j.endsAt}`}`,
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
    const title = m.title ?? j.title
    pages.push({
      description: summarize(m.body) || `${title} · ${j.title}`,
      dir: `${handle}/${slug}/m/${m.id}`,
      hero: heroOf(
        m.coverMediaId,
        tree.media.filter((x) => x.momentId === m.id),
      ),
      kind: 'moment',
      title: m.title === null ? j.title : `${m.title} · ${j.title}`,
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
  { embed, inlineStyles = {}, mediaBaseUrl, siteUrl, supabaseUrl },
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
    ...originHints({ mediaBaseUrl, supabaseUrl }),
  ].filter((t) => t !== null)
  const block = `    ${tags.join('\n    ')}\n  </head>`
  // Replacer function: a string would interpret $$, $&, $' and $` in user text.
  html = html.replace('</head>', () => block)
  const shell = page.shell === undefined ? null : shellHtml(page.shell)
  const embedTag = `<script type="application/json" id="${EMBED_SCRIPT_ID}">${serializeJsonForScript(embed)}</script>`
  let tail = embedTag
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
        return css === undefined
          ? tag
          : `<style>${css.replaceAll('</style', '<\\/style')}</style>`
      },
    )
    tail = `${embedTag}\n    ${bootScript(boot)}`
  }
  // vite.config.ts (landingShell) fills #root with the landing hero; it does
  // not belong on journey pages, so replace the whole root element.
  const root =
    shell === null
      ? '<div id="root"></div>'
      : `${shell}\n    <div id="root" hidden></div>`
  html = html.replace(
    /<div id="root">[\s\S]*?<\/div>(?=\s*<script>)|<div id="root"><\/div>/,
    () => root,
  )
  return html.replace('</body>', () => `    ${tail}\n  </body>`)
}

/**
 * Inline loader: appends the app's module scripts once the hero image has
 * loaded (or failed, or after 4 s), so the bundle never competes with the LCP
 * image. Without a hero image it boots at once.
 */
export function bootScript(srcs) {
  return `<script>(function(){var s=${serializeJsonForScript(srcs)},b=0;function go(){if(b)return;b=1;for(var k=0;k<s.length;k++){var e=document.createElement('script');e.type='module';e.crossOrigin='anonymous';e.src=s[k];document.head.appendChild(e)}}var i=document.querySelector('#${SHELL_ID} img');if(!i||i.complete){go();return}i.addEventListener('load',go);i.addEventListener('error',go);setTimeout(go,4000)})()</script>`
}

/**
 * Static hero painted before the JS bundle runs. Mirrors the hero block of
 * src/pages/public-journey/PublicJourneyPage.tsx (classes, sizes, dimensions);
 * keep both in sync. Removed by releasePrerenderShell() once React has rendered.
 */
export const HERO_SIZES = '(min-width: 1024px) 1024px, 100vw'
export const SHELL_ID = 'prerender-shell'

export function shellHtml({ eyebrow, hero, period, summary, title }) {
  const focal =
    hero.focalX !== null && hero.focalY !== null
      ? ` style="object-position:${String(hero.focalX * 100)}% ${String(hero.focalY * 100)}%"`
      : ''
  const srcset =
    hero.srcSet === '' ? '' : ` srcset="${escapeHtml(hero.srcSet)}"`
  const img = `<img alt="${escapeHtml(hero.alt)}" class="h-full w-full object-cover" decoding="async" fetchpriority="high" height="${String(hero.height)}" loading="eager" sizes="${HERO_SIZES}" src="${escapeHtml(hero.src)}"${srcset}${focal} width="${String(hero.width)}" />`
  const lines = [
    `<div class="overflow-hidden rounded-lg bg-surface" style="aspect-ratio:16 / 9">${img}</div>`,
    `<p class="text-sm text-muted">${escapeHtml(eyebrow)}</p>`,
    `<h1 class="text-3xl font-semibold">${escapeHtml(title)}</h1>`,
    period === null || period === undefined
      ? null
      : `<p class="text-sm text-muted">${escapeHtml(period)}</p>`,
    summary === ''
      ? null
      : `<p class="whitespace-pre-line leading-7">${escapeHtml(summary)}</p>`,
  ].filter((l) => l !== null)
  return `<div id="${SHELL_ID}"><main class="mx-auto max-w-5xl space-y-10 px-5 py-8"><header class="space-y-4">${lines.join('')}</header></main></div>`
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
function originHints({ mediaBaseUrl, supabaseUrl }) {
  const media = originOf(mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL)
  const api = supabaseUrl === undefined ? null : originOf(supabaseUrl)
  return [
    media === null ? null : `<link rel="preconnect" href="${media}" />`,
    api === null || api === media
      ? null
      : `<link rel="preconnect" href="${api}" crossorigin />`,
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
