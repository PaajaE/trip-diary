import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(dirname, '../..')

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@trip-diary/i18n': path.resolve(
        workspaceRoot,
        'packages/i18n/src/index.ts',
      ),
      '@trip-diary/core/entry': path.resolve(
        workspaceRoot,
        'packages/core/src/entry.ts',
      ),
      '@trip-diary/core/journey': path.resolve(
        workspaceRoot,
        'packages/core/src/journey.ts',
      ),
      '@trip-diary/utils': path.resolve(
        workspaceRoot,
        'packages/utils/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
  },
})
