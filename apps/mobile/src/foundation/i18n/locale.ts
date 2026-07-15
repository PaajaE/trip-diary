export type SupportedLocale = 'cs' | 'en'

export const LOCALE_STORAGE_KEY = 'trip-diary.locale'
export const DEFAULT_LOCALE: SupportedLocale = 'en'
export const FALLBACK_LOCALE: SupportedLocale = 'en'

export function normalizeLocale(
  value: string | null | undefined,
): SupportedLocale | null {
  if (value === 'cs' || value === 'en') {
    return value
  }

  return null
}

export function detectDeviceLocale(
  languageCode: string | null | undefined,
): SupportedLocale {
  if (languageCode === 'cs') {
    return 'cs'
  }

  return DEFAULT_LOCALE
}

export async function resolveInitialLocale(deps: {
  getStoredLocale: () => Promise<string | null>
  getDeviceLanguageCode: () => string | null | undefined
}): Promise<SupportedLocale> {
  const stored = normalizeLocale(await deps.getStoredLocale())
  if (stored !== null) {
    return stored
  }

  return detectDeviceLocale(deps.getDeviceLanguageCode())
}
