/**
 * Edge entry for translate-entry. Canonical pure helpers live in
 * `supabase/functions/_shared/translation/` and are re-exported by
 * `@trip-diary/translation` for web/package tests.
 */
export {
  hashSourceContent,
  MockTranslationProvider,
  parseAuthorizationHeader,
  parseTranslationRequest,
  resolveTranslationProvider,
  shouldReturnCachedTranslation,
  type ExistingTranslationSnapshot,
  type TranslationFormat,
  type TranslationLocale,
  type TranslationProvider,
  type TranslationProviderInput,
  type TranslationProviderResult,
  type TranslationRequest,
} from '../_shared/translation/mod.ts'
