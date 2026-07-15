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

const mobileToolingFiles = [
  'apps/mobile/babel.config.js',
  'apps/mobile/metro.config.js',
  'apps/mobile/react-native.config.js',
  'apps/mobile/vitest.config.ts',
  'apps/mobile/scripts/patch-android-autolinking.mjs',
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

const mobileBrowserGlobals = [
  {
    message: 'Use React Native APIs instead of browser globals in mobile code.',
    name: 'window',
  },
  {
    message: 'Use React Native APIs instead of browser globals in mobile code.',
    name: 'document',
  },
  {
    message: 'Use React Native APIs instead of browser globals in mobile code.',
    name: 'localStorage',
  },
]

const mobileTestOverrides = {
  '@typescript-eslint/no-confusing-void-expression': 'off',
  '@typescript-eslint/no-deprecated': 'off',
  '@typescript-eslint/no-empty-function': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-non-null-assertion': 'off',
  '@typescript-eslint/no-require-await': 'off',
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
  'no-restricted-imports': 'off',
}

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
    'apps/mobile/ios/**',
    'apps/mobile/android/**',
    'apps/mobile/.expo/**',
    'apps/mobile/expo-env.d.ts',
    '**/.pnpm-store/**',
    'pnpm-lock.yaml',
  ]),

  // --- Tooling / Node scripts (no type-aware lint) ---
  {
    files: [
      'eslint.config.js',
      ...rootScriptFiles,
      ...mobileToolingFiles,
      ...packageVitestConfigs,
    ],
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
  {
    files: ['apps/mobile/metro.config.js', 'apps/mobile/babel.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
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

  // --- Expo mobile app ---
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2021,
        __DEV__: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        projectService: {
          allowDefaultProject: mobileToolingFiles,
        },
        tsconfigRootDir,
      },
      sourceType: 'module',
    },
    rules: {
      ...sharedTypeCheckedRules,
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-require-await': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-restricted-globals': ['error', ...mobileBrowserGlobals],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@react-native-community/netinfo',
              message:
                'Import NetInfo only through foundation/network (createNetInfoNetworkStateProvider).',
            },
          ],
        },
      ],
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/platform/storage/database.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-sqlite',
              importNames: ['openDatabaseAsync'],
              message:
                'Open SQLite only through platform/storage/database.ts (getMobileDatabase).',
            },
            {
              name: '@react-native-community/netinfo',
              message:
                'Import NetInfo only through foundation/network (createNetInfoNetworkStateProvider).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/src/foundation/network/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['apps/mobile/src/features/journeys/index.ts'],
    rules: {
      '@typescript-eslint/no-deprecated': 'off',
    },
  },
  {
    files: [
      'apps/mobile/**/*.test.ts',
      'apps/mobile/**/*.test.tsx',
      'apps/mobile/src/**/test-utils/**/*.ts',
      'apps/mobile/src/foundation/test-utils/**/*.tsx',
    ],
    rules: mobileTestOverrides,
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
