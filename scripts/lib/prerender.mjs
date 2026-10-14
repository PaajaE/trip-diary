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
    return { ogImage: url, src: url, srcSet: '' }
  }
  const sorted = imageVariants(media)
  if (sorted.length === 0) return null
  const large =
    sorted.find((v) => v.kind === 'large') ?? sorted[sorted.length - 1]
  const medium = sorted.find((v) => v.kind === 'medium') ?? large
  const seen = new Set()
  const parts = []
  for (const v of sorted) {
    if (seen.has(v.width)) continue
    seen.add(v.width)
    parts.push(`${mediaUrl(v.storageKey, baseUrl)} ${String(v.width)}w`)
  }
  return {
    ogImage: mediaUrl(large.storageKey, baseUrl),
    src: mediaUrl(medium.storageKey, baseUrl),
    srcSet: parts.join(', '),
  }
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
  const pages = [
    {
      description: summarize(j.summary) || `${j.title} · ${site}`,
      dir: `${handle}/${slug}`,
      hero: heroOf(j.coverMediaId, []),
      kind: 'journey',
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
export function renderPage(template, page, { embed, siteUrl }) {
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
    `<script type="application/json" id="${EMBED_SCRIPT_ID}">${serializeJsonForScript(embed)}</script>`,
  ].filter((t) => t !== null)
  return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
}

function preloadTag(hero) {
  const srcset =
    hero.srcSet === ''
      ? ''
      : ` imagesrcset="${escapeHtml(hero.srcSet)}" imagesizes="100vw"`
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
