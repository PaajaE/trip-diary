const KNOWN_TRANSLATION_ERROR_CODES = new Set([
  'entry_not_found',
  'invalid_translation_response',
  'same_locale',
  'translation_failed',
  'translation_invoke_failed',
  'translation_save_failed',
  'unauthorized',
])

export function formatTranslationErrorMessage(
  error: unknown,
  translate: (key: string) => string,
  fallbackKey = 'entry.translation.error',
): string {
  const message =
    error instanceof Error ? error.message : 'translation_failed'

  if (KNOWN_TRANSLATION_ERROR_CODES.has(message)) {
    return translate(`entry.translation.errors.${message}`)
  }

  return translate(fallbackKey)
}

export function formatStoredTranslationErrorMessage(
  message: string,
  translate: (key: string) => string,
): string {
  if (KNOWN_TRANSLATION_ERROR_CODES.has(message)) {
    return translate(`entry.translation.errors.${message}`)
  }

  return translate('entry.translation.error')
}
