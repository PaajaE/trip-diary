import { describe, expect, it } from 'vitest'
import {
  buildPages,
  buildRobots,
  buildSitemap,
  escapeHtml,
  isSafePathSegment,
  renderPage,
  resolveHero,
  routePreloads,
  serializeJsonForScript,
  smallVariantUrl,
  withLocalVariant,
} from './prerender.mjs'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const variants = [
  {
    height: 100,
    kind: 'thumb',
    mimeType: 'image/webp',
    storageKey: 'a/t.webp',
    width: 150,
  },
  {
    height: 800,
    kind: 'medium',
    mimeType: 'image/webp',
    storageKey: 'a/m.webp',
    width: 1000,
  },
  {
    height: 1600,
    kind: 'large',
    mimeType: 'image/webp',
    storageKey: 'a/l.webp',
    width: 2000,
  },
]
const media = {
  id: id(1),
  kind: 'photo',
  momentId: id(3),
  segmentOverrideId: null,
  starred: true,
  variants,
}
const tree = {
  journey: {
    coverMediaId: id(1),
    space: { handle: 'pavel', name: 'Pavel' },
    summary: 'Hory </script> & more',
    title: 'Kanada "2026"',
  },
  media: [media],
  moments: [{ body: 'Text', coverMediaId: null, id: id(3), title: null }],
  segments: [{ body: '', coverMediaId: null, id: id(2), title: 'Calgary' }],
  tracks: [],
}
const template =
  '<html><head><title>Old</title><meta name="description" content="old" /><meta property="og:title" content="old" /></head><body></body></html>'

describe('prerender helpers', () => {
  it('escapes html and script json', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;',
    )
    const out = serializeJsonForScript({ a: '</script><!--\u2028\u2029&' })
    expect(out).not.toMatch(/[<>&\u2028\u2029]/)
    expect(JSON.parse(out).a).toBe('</script><!--\u2028\u2029&')
  })

  it('validates path segments', () => {
    expect(isSafePathSegment('pavel-1')).toBe(true)
    expect(isSafePathSegment('..')).toBe(false)
    expect(isSafePathSegment('a/b')).toBe(false)
  })

  it('builds srcset and large og image', () => {
    const hero = resolveHero(media, 'https://m.test/')
    expect(hero.ogImage).toBe('https://m.test/a/l.webp')
    expect(hero.srcSet).toBe(
      'https://m.test/a/t.webp 150w, https://m.test/a/m.webp 1000w, https://m.test/a/l.webp 2000w',
    )
  })

  it('lays out one page per journey, segment and moment', () => {
    const pages = buildPages(tree, {
      handle: 'pavel',
      mediaBaseUrl: 'https://m.test',
      slug: 'kanada',
    })
    expect(pages.map((p) => p.dir)).toEqual([
      'pavel/kanada',
      `pavel/kanada/e/${id(2)}`,
      `pavel/kanada/m/${id(3)}`,
    ])
    expect(pages[1].urlPath).toBe(`/pavel/kanada/e/${id(2)}`)
    expect(pages[1].hero).not.toBeNull()
  })

  it('renders head tags, preload and embedded json', () => {
    const [page] = buildPages(tree, {
      handle: 'pavel',
      mediaBaseUrl: 'https://m.test',
      slug: 'kanada',
    })
    const html = renderPage(template, page, {
      embed: tree,
      siteUrl: 'https://site.test/',
    })
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).toContain('<title>Kanada &quot;2026&quot; · Pavel</title>')
    expect(html).toContain(
      '<link rel="canonical" href="https://site.test/pavel/kanada" />',
    )
    expect(html).toContain(
      'property="og:image" content="https://m.test/a/l.webp"',
    )
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toMatch(
      /rel="preload" as="image" fetchpriority="high" href="[^"]+" imagesrcset="[^"]*2000w"/,
    )
    expect(html).toContain(
      '<script type="application/json" id="__PUBLIC_JOURNEY__">',
    )
    expect(html).not.toContain('</script><!--')
    // embedded json + boot loader
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    expect(html).not.toContain('content="old"')
  })

  it('renders a static hero shell, hidden root and preconnect hints', () => {
    const tpl =
      '<html><head></head><body><div id="root">\n<div id="landing-shell"><div>x</div>\n</div>\n</div>\n<script>1</script></body></html>'
    const [page] = buildPages(tree, {
      handle: 'pavel',
      mediaBaseUrl: 'https://m.test',
      slug: 'kanada',
    })
    const html = renderPage(tpl, page, {
      embed: tree,
      mediaBaseUrl: 'https://m.test',
      supabaseUrl: 'https://api.test',
    })
    expect(html).toContain('<div id="prerender-shell">')
    expect(html).toContain('<div id="root" hidden></div>')
    expect(html).not.toContain('landing-shell')
    expect(html).toContain(
      '<h1 class="text-3xl font-semibold">Kanada &quot;2026&quot;</h1>',
    )
    expect(html).toContain('fetchpriority="high"')
    expect(html).toContain('sizes="(min-width: 1024px) 1024px, 100vw"')
    expect(html).toContain('imagesizes="(min-width: 1024px) 1024px, 100vw"')
    expect(html).toContain('width="1000" ')
    expect(html).toContain('<link rel="preconnect" href="https://m.test" />')
    expect(html).toContain(
      '<link rel="preconnect" href="https://api.test" crossorigin />',
    )
    const segment = buildPages(tree, { handle: 'pavel', slug: 'kanada' })[1]
    expect(renderPage(tpl, segment, { embed: tree })).not.toContain(
      'prerender-shell',
    )
  })

  it('defers the app bundle behind the hero, inlines css, embeds json last', () => {
    const tpl =
      '<html><head><script type="module" crossorigin src="/assets/app-1.js"></script><link rel="modulepreload" crossorigin href="/assets/x.js"><link rel="stylesheet" crossorigin href="/assets/app-1.css"></head><body><div id="root"></div><script>1</script></body></html>'
    const [page, segment] = buildPages(tree, {
      handle: 'pavel',
      mediaBaseUrl: 'https://m.test',
      slug: 'kanada',
    })
    const html = renderPage(tpl, page, {
      embed: tree,
      inlineStyles: { '/assets/app-1.css': 'a{color:red}</style>' },
      mediaBaseUrl: 'https://m.test',
    })
    expect(html).not.toContain('<script type="module"')
    expect(html).not.toContain('modulepreload')
    // Only an inert (disabled, never fetched) link remains, so Vite's lazy
    // chunk loader does not download the inlined stylesheet again.
    expect(html).not.toMatch(/<link rel="stylesheet"(?![^>]*disabled)/)
    expect(html).toContain(
      '<style>a{color:red}<\\/style></style><link rel="stylesheet" href="/assets/app-1.css" disabled />',
    )
    expect(html).toContain('["/assets/app-1.js"]')
    const embedAt = html.indexOf('id="__PUBLIC_JOURNEY__"')
    expect(embedAt).toBeGreaterThan(html.indexOf('</head>'))
    expect(embedAt).toBeLessThan(html.indexOf('</body>'))
    // Pages without a shell keep the normal script tags and stylesheet.
    const plain = renderPage(tpl, segment, { embed: tree })
    expect(plain).toContain('<script type="module"')
    expect(plain).toContain('rel="stylesheet"')
  })

  it('puts the route heading and a map preview into the shell, both languages', () => {
    const located = {
      ...tree,
      moments: [
        {
          ...tree.moments[0],
          latitude: 51,
          longitude: -114,
          startsAt: '2026-07-16T10:00:00Z',
        },
        {
          ...tree.moments[0],
          id: id(9),
          latitude: 51.2,
          longitude: -115,
          startsAt: '2026-07-17T10:00:00Z',
        },
      ],
    }
    const [page] = buildPages(located, { handle: 'pavel', slug: 'kanada' })
    const strings = {
      cs: { attribution: 'Mapa cs', route: 'Trasa' },
      en: { attribution: 'Map en', route: 'Route' },
    }
    const tpl = '<html><head></head><body><div id="root"></div></body></html>'
    const html = renderPage(tpl, page, { embed: located, strings })
    expect(html).toContain('<span data-l="cs">Trasa</span>')
    expect(html).toContain('<span data-l="en" hidden>Route</span>')
    expect(html).toContain('<span data-l="cs">Mapa cs</span>')
    expect(html).toContain('viewBox="0 0 372 352"')
    expect(html).toContain('stroke-dasharray')
    expect(html).toContain('trip-diary.locale')
    // Without strings the shell is the plain hero block (no map section).
    expect(renderPage(tpl, page, { embed: located })).not.toContain(
      'route-heading-shell',
    )
  })

  it('loads the tree from a data file instead of inlining it', () => {
    const tpl =
      '<html><head><script type="module" crossorigin src="/assets/app-1.js"></script></head><body><div id="root"></div></body></html>'
    const [page] = buildPages(tree, { handle: 'pavel', slug: 'kanada' })
    const html = renderPage(tpl, page, {
      dataUrl: '/pavel/kanada/data.json',
      embed: tree,
      preload: { css: ['/a/m.css'], js: ['/a/route.js'] },
    })
    expect(html).not.toContain('<script type="application/json"')
    expect(html).not.toContain('journeySlug')
    expect(html).toContain('fetch("/pavel/kanada/data.json")')
    expect(html).toContain("id='__PUBLIC_JOURNEY__'")
    expect(html).toContain('["modulepreload","/a/route.js",""]')
    expect(html).toContain('["preload","/a/m.css","style"]')
    // The loader sits right after the shell, before the rest of the body.
    expect(html.indexOf('fetch(')).toBeLessThan(html.indexOf('</body>'))
  })

  it('lists the route chunks to preload from the build manifest', () => {
    const manifest = {
      '_app.js': { file: 'assets/app.js' },
      '_dep.js': { css: ['assets/dep.css'], file: 'assets/dep.js' },
      '_runtime.js': { file: 'assets/runtime.js' },
      'src/pages/public-journey/PublicJourneyRoutePages.tsx': {
        dynamicImports: [
          'src/features/public-journey/ui/PublicJourneyMap.tsx',
          'src/pages/other.tsx',
        ],
        file: 'assets/route.js',
        imports: ['_runtime.js', '_app.js', '_dep.js'],
        src: 'src/pages/public-journey/PublicJourneyRoutePages.tsx',
      },
      'src/features/public-journey/ui/PublicJourneyMap.tsx': {
        css: ['assets/app.css'],
        file: 'assets/map.js',
        imports: ['_app.js'],
        src: 'src/features/public-journey/ui/PublicJourneyMap.tsx',
      },
      'src/pages/other.tsx': { file: 'assets/other.js' },
    }
    expect(
      routePreloads(manifest, {
        base: '/',
        entryFiles: ['assets/app.js', 'assets/runtime.js'],
        skipCss: ['/assets/app.css'],
      }),
    ).toEqual({
      css: ['/assets/dep.css'],
      js: ['/assets/route.js', '/assets/dep.js', '/assets/map.js'],
    })
    expect(routePreloads(null)).toEqual({ css: [], js: [] })
    expect(routePreloads({})).toEqual({ css: [], js: [] })
  })

  it('swaps the small variant for a same-origin copy', () => {
    const hero = {
      ogImage: 'https://m.test/a/large.jpg',
      src: 'https://m.test/a/medium.jpg',
      srcSet:
        'https://m.test/a/thumb.jpg 220w, https://m.test/a/small.jpg 800w, https://m.test/a/medium.jpg 1600w',
    }
    expect(smallVariantUrl(hero)).toBe('https://m.test/a/small.jpg')
    expect(smallVariantUrl({ srcSet: '' })).toBeNull()
    const local = withLocalVariant(
      hero,
      'https://m.test/a/small.jpg',
      '/hero/x.jpg',
    )
    expect(local.srcSet).toContain('/hero/x.jpg 800w')
    expect(local.srcSet).toContain('https://m.test/a/medium.jpg 1600w')
    expect(local.ogImage).toBe('https://m.test/a/large.jpg')
  })

  it("keeps $-patterns in user text literal ($$, $&, $', $`)", () => {
    const [page] = buildPages(tree, { handle: 'pavel', slug: 'kanada' })
    const nasty = "a $$ b $& c $' d $` e"
    const html = renderPage(
      template,
      { ...page, description: nasty, title: nasty },
      { embed: { ...tree, note: nasty } },
    )
    expect(html).toContain(`<title>${escapeHtml(nasty)}</title>`)
    expect(html).toContain(`content="${escapeHtml(nasty)}"`)
    expect(html).toContain('a $$ b $&amp; c')
    expect(html.match(/<\/head>/g)).toHaveLength(1)
    expect(html).not.toContain('<title>Old</title>')
    const json = html.match(/id="__PUBLIC_JOURNEY__">([^<]*)</)?.[1]
    expect(JSON.parse(json).note).toBe(nasty)
  })

  it('omits canonical without site url', () => {
    const [page] = buildPages(tree, { handle: 'pavel', slug: 'kanada' })
    expect(renderPage(template, page, { embed: tree })).not.toContain(
      'canonical',
    )
  })

  it('builds sitemap and robots', () => {
    const xml = buildSitemap(
      [{ lastmod: '2026-10-01T00:00:00Z', urlPath: '/pavel/kanada' }],
      'https://site.test/',
    )
    expect(xml).toContain('<loc>https://site.test/pavel/kanada</loc>')
    expect(xml).toContain('<lastmod>2026-10-01T00:00:00.000Z</lastmod>')
    expect(buildRobots('User-agent: *\nAllow: /', 'https://site.test')).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://site.test/sitemap.xml\n',
    )
  })
})
