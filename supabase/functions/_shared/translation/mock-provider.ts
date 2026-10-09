import type {
  TranslationFormat,
  TranslationProvider,
  TranslationProviderInput,
  TranslationProviderResult,
} from './provider.ts'
import type { TranslationLocale } from './locale.ts'

export class MockTranslationProvider implements TranslationProvider {
  readonly id = 'mock'

  async translate(
    input: TranslationProviderInput,
  ): Promise<TranslationProviderResult> {
    const prefix = `[${input.targetLocale}]`

    return {
      body: `${prefix} ${input.body}`,
      model: 'mock-model',
      title: input.title === null ? null : `${prefix} ${input.title}`,
    }
  }
}

/**
 * Resolves the active translation provider from server configuration.
 * When TRANSLATION_API_KEY is unset (local dev, CI, tests), the mock provider
 * is used so no paid API calls are made. Production activation requires
 * deliberately wiring a real provider here once credentials are available.
 */
export function resolveTranslationProvider(
  translationApiKey: string | undefined,
): TranslationProvider {
  if (translationApiKey === undefined || translationApiKey.trim() === '') {
    return new MockTranslationProvider()
  }

  // Real provider wiring lands in a follow-up once API credentials are available.
  return new MockTranslationProvider()
}

export type { TranslationFormat, TranslationLocale }
