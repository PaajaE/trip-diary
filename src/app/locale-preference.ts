export type AppLocale = 'cs' | 'en'

const STORAGE_KEY = 'trip-diary.locale'

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'cs' || value === 'en'
}

export function readStoredLocale(): AppLocale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isAppLocale(stored) ? stored : null
  } catch {
    return null
  }
}

export function storeLocale(locale: AppLocale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts one visit.
  }
}

/** Czech and Slovak browsers get Czech, everyone else English. */
export function detectBrowserLocale(): AppLocale {
  const languages =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]
    if (base === 'cs' || base === 'sk') return 'cs'
    if (base === 'en') return 'en'
  }
  return 'en'
}

export function resolveInitialLocale(): AppLocale {
  return readStoredLocale() ?? detectBrowserLocale()
}
