export { TRANSLATION_LOCALES, isTranslationLocale } from './locale.ts'
export type { TranslationLocale } from './locale.ts'

export type {
  TranslationFormat,
  TranslationProvider,
  TranslationProviderInput,
  TranslationProviderResult,
} from './provider.ts'

export { computeSourceContentHash } from './source-hash.ts'
export { computeSourceContentHash as hashSourceContent } from './source-hash.ts'

export {
  MockTranslationProvider,
  resolveTranslationProvider,
} from './mock-provider.ts'

export {
  parseAuthorizationHeader,
  parseTranslationRequest,
  type TranslationRequest,
} from './request.ts'

export {
  shouldReturnCachedTranslation,
  type ExistingTranslationSnapshot,
} from './cache-policy.ts'
