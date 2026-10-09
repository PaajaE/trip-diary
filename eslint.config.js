import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const tsconfigRootDir = import.meta.dirname

const packageVitestConfigs = [
  'packages/config/vitest.config.ts',
  'packages/core/vitest.config.ts',
  'packages/maps/vitest.config.ts',
  'packages/translation/vitest.config.ts',
  'packages/utils/vitest.config.ts',
]

const rootScriptFiles = [
  'scripts/backfill-photo-gps.mjs',
  'scripts/patch-database-types.mjs',
  'scripts/prepare-e2e-env.mjs',
]

const sharedTypeCheckedRules = {
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { fixStyle: 'inline-type-imports' },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
}

const packageBoundaryPatterns = [
  {
    group: [
      'react',
      'react-dom',
      'react-native',
      'react-native/*',
      'expo',
      'expo-*',
    ],
    message: 'Shared packages must remain platform-neutral.',
  },
  {
    group: ['@supabase/*', 'dexie', 'dexie/*', 'expo-sqlite'],
    message:
      'Shared packages must not depend on storage or remote client SDKs.',
  },
]

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'playwright-report',
    'android/**/build/**',
    'ios/**/build/**',
    'src/shared/api/database.types.ts',
    'supabase/functions/**',
    'supabase/.temp/**',
    '**/.pnpm-store/**',
    'pnpm-lock.yaml',
  ]),

  // --- Tooling / Node scripts (no type-aware lint) ---
  {
    files: ['eslint.config.js', ...rootScriptFiles, ...packageVitestConfigs],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // --- Shared packages (platform-neutral libraries) ---
  {
    files: ['packages/*/src/**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
      sourceType: 'module',
    },
    rules: {
      ...sharedTypeCheckedRules,
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: packageBoundaryPatterns,
        },
      ],
    },
  },
  {
    files: ['packages/*/src/**/*.test.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-await': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // --- Web application (existing behavior) ---
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      jsxA11y.flatConfigs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
      sourceType: 'module',
    },
    rules: {
      ...sharedTypeCheckedRules,
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/features/entries/api/translation.repository',
              message:
                'Import translation data access from @/entities/translation/api.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-await': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
])
