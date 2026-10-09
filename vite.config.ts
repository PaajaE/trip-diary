import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'
import { cs } from './packages/i18n/src/cs'
import { en } from './packages/i18n/src/en'

const base = process.env.VITE_BASE_PATH ?? '/'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Paints the landing hero straight from the HTML, so first paint does not wait
 * for the JS bundle. The copy comes from the i18n resources (no duplicated
 * strings); React replaces the shell on mount and it is dropped on other routes.
 */
function landingShell(): Plugin {
  const block = (locale: 'cs' | 'en', t: typeof cs) => `
        <div lang="${locale}"${locale === 'cs' ? '' : ' hidden'}>
          <header class="sticky top-0 z-20 border-b border-border/60 bg-background/90 px-5 sm:px-8" style="padding-top:env(safe-area-inset-top)">
            <div class="mx-auto flex min-h-16 max-w-5xl items-center"><span class="text-sm font-semibold tracking-wide">${escapeHtml(t.brand)}</span></div>
          </header>
          <main class="mx-auto w-full max-w-5xl px-5 pt-10 pb-16 sm:px-8 sm:pt-16 sm:pb-24">
            <p class="text-[0.6875rem] font-semibold tracking-[0.18em] text-accent-strong uppercase">${escapeHtml(t.home.eyebrow)}</p>
            <h1 class="reader-display mt-5 max-w-2xl text-4xl leading-[1.05] tracking-[-0.04em] sm:text-6xl">${escapeHtml(t.home.title)}</h1>
            <p class="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg">${escapeHtml(t.home.description)}</p>
          </main>
        </div>`
  return {
    name: 'landing-shell',
    transformIndexHtml(html) {
      const root = `<div id="root">
      <div id="landing-shell">${block('cs', cs)}${block('en', en)}
      </div>
    </div>
    <script>
      ;(() => {
        const shell = document.getElementById('landing-shell')
        const root = ${JSON.stringify(base)}.replace(/\\/$/, '')
        if (shell === null) return
        if (window.location.pathname.replace(/\\/$/, '') !== root) {
          shell.remove()
          return
        }
        let locale = null
        try {
          locale = window.localStorage.getItem('trip-diary.locale')
        } catch {}
        if (locale !== 'cs' && locale !== 'en') {
          const base = (navigator.languages?.[0] ?? navigator.language ?? '')
            .toLowerCase()
            .split('-')[0]
          locale = base === 'cs' || base === 'sk' ? 'cs' : 'en'
        }
        document.documentElement.lang = locale
        for (const part of shell.children) part.hidden = part.lang !== locale
      })()
    </script>`
      return html.replace('<div id="root"></div>', root)
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    landingShell(),
    react(),
    tailwindcss(),
    VitePWA({
      includeAssets: ['app-icon.svg'],
      manifest: {
        background_color: '#f7f4ed',
        description: 'A calm, offline-ready diary for journeys and memories.',
        display: 'standalone',
        icons: [
          {
            purpose: 'any',
            sizes: 'any',
            src: 'app-icon.svg',
            type: 'image/svg+xml',
          },
          {
            purpose: 'maskable',
            sizes: 'any',
            src: 'app-icon.svg',
            type: 'image/svg+xml',
          },
        ],
        name: 'Trip Diary',
        scope: '.',
        short_name: 'Trip Diary',
        start_url: '.',
        theme_color: '#285845',
      },
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            handler: 'CacheFirst',
            options: {
              cacheName: 'journey-map-tiles',
              expiration: { maxAgeSeconds: 604800, maxEntries: 250 },
            },
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
          },
          {
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapy-basemap-tiles',
              expiration: { maxAgeSeconds: 604800, maxEntries: 500 },
            },
            urlPattern: /^https:\/\/api\.mapy\.com\/v1\/maptiles\//,
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@trip-diary/api': fileURLToPath(
        new URL('./packages/api/src/index.ts', import.meta.url),
      ),
      '@trip-diary/config': fileURLToPath(
        new URL('./packages/config/src/index.ts', import.meta.url),
      ),
      '@trip-diary/i18n': fileURLToPath(
        new URL('./packages/i18n/src/index.ts', import.meta.url),
      ),
      '@trip-diary/core/entry': fileURLToPath(
        new URL('./packages/core/src/entry.ts', import.meta.url),
      ),
      '@trip-diary/core/journey': fileURLToPath(
        new URL('./packages/core/src/journey.ts', import.meta.url),
      ),
      '@trip-diary/maps': fileURLToPath(
        new URL('./packages/maps/src/index.ts', import.meta.url),
      ),
      '@trip-diary/translation': fileURLToPath(
        new URL('./packages/translation/src/index.ts', import.meta.url),
      ),
      '@trip-diary/utils': fileURLToPath(
        new URL('./packages/utils/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [
      'tests/e2e/**',
      'node_modules/**',
      'dist/**',
      'packages/**',
      'apps/**',
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
})
