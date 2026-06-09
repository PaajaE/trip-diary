import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cs } from '@/shared/i18n/cs'
import { en, type TranslationResources } from '@/shared/i18n/en'

const resources = {
  cs: { translation: cs satisfies TranslationResources },
  en: { translation: en },
} as const

await i18n.use(initReactI18next).init({
  resources,
  lng: 'cs',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export { i18n }
