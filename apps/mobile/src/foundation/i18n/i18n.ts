import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cs, en } from '@trip-diary/i18n'
import type { SupportedLocale } from '@/foundation/i18n/locale'

const resources = {
  cs: { translation: cs },
  en: { translation: en },
} as const

let initialized = false

export function initI18n(locale: SupportedLocale): typeof i18n {
  if (!initialized) {
    void i18n.use(initReactI18next).init({
      compatibilityJSON: 'v4',
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      lng: locale,
      resources,
    })
    initialized = true
    return i18n
  }

  if (i18n.language !== locale) {
    void i18n.changeLanguage(locale)
  }

  return i18n
}

export function resetI18nForTests(): void {
  initialized = false
}

export { i18n }
