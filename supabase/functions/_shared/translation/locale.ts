export const TRANSLATION_LOCALES = ['cs', 'en'] as const

export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number]

export function isTranslationLocale(
  value: unknown,
): value is TranslationLocale {
  return (
    typeof value === 'string' &&
    (TRANSLATION_LOCALES as readonly string[]).includes(value)
  )
}
