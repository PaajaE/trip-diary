import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cs } from '@/shared/i18n/cs'
import { resolveInitialLocale } from '@/app/locale-preference'
import { en, type TranslationResources } from '@/shared/i18n/en'

const resources = {
  cs: { translation: cs satisfies TranslationResources },
  en: { translation: en },
} as const

await i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLocale(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

function syncDocumentLanguage(locale: string) {
  document.documentElement.lang = locale
}

syncDocumentLanguage(i18n.language)
i18n.on('languageChanged', syncDocumentLanguage)

export { i18n }
