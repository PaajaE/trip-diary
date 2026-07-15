import type { TranslationLocale } from './types.js'

export type TranslationFormat = 'plain' | 'markdown'

export interface TranslationProviderInput {
  body: string
  format: TranslationFormat
  sourceLocale: TranslationLocale
  targetLocale: TranslationLocale
  title: string | null
}

export interface TranslationProviderResult {
  body: string
  model: string
  title: string | null
}

export interface TranslationProvider {
  readonly id: string
  translate(input: TranslationProviderInput): Promise<TranslationProviderResult>
}
