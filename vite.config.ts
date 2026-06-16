import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
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
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
