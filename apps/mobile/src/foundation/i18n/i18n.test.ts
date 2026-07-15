import { beforeEach, describe, expect, it } from 'vitest'
import { initI18n, resetI18nForTests } from '@/foundation/i18n/i18n'
import {
  detectDeviceLocale,
  normalizeLocale,
  resolveInitialLocale,
} from '@/foundation/i18n/locale'

describe('locale detection', () => {
  it('normalizes supported locales only', () => {
    expect(normalizeLocale('cs')).toBe('cs')
    expect(normalizeLocale('en')).toBe('en')
    expect(normalizeLocale('de')).toBeNull()
  })

  it('detects Czech device language', () => {
    expect(detectDeviceLocale('cs')).toBe('cs')
  })

  it('falls back to English for other device languages', () => {
    expect(detectDeviceLocale('de')).toBe('en')
    expect(detectDeviceLocale(null)).toBe('en')
  })

  it('prefers stored locale over device locale', async () => {
    await expect(
      resolveInitialLocale({
        getDeviceLanguageCode: () => 'de',
        getStoredLocale: async () => 'cs',
      }),
    ).resolves.toBe('cs')
  })

  it('uses device locale when nothing is stored', async () => {
    await expect(
      resolveInitialLocale({
        getDeviceLanguageCode: () => 'cs',
        getStoredLocale: async () => null,
      }),
    ).resolves.toBe('cs')
  })
})

describe('mobile i18n rendering', () => {
  beforeEach(() => {
    resetI18nForTests()
  })

  it('renders Czech dashboard copy', () => {
    const i18n = initI18n('cs')
    expect(i18n.t('dashboard.yourTrips')).toBe('Vaše cesty')
    expect(i18n.t('common.tryAgain')).toBe('Zkusit znovu')
  })

  it('falls back to English for missing Czech keys via fallbackLng', () => {
    const i18n = initI18n('cs')
    expect(i18n.t('brand')).toBe('Trip Diary')
  })

  it('renders English auth copy', () => {
    const i18n = initI18n('en')
    expect(i18n.t('auth.signIn.title')).toBe('Welcome back')
    expect(i18n.t('mobile.devChecklist')).toBe('Developer checklist')
  })
})
