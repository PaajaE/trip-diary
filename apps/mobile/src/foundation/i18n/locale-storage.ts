import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Localization from 'expo-localization'
import {
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  resolveInitialLocale,
  type SupportedLocale,
} from '@/foundation/i18n/locale'

export async function getStoredLocale(): Promise<string | null> {
  return AsyncStorage.getItem(LOCALE_STORAGE_KEY)
}

export function getDeviceLanguageCode(): string | null | undefined {
  return Localization.getLocales()[0]?.languageCode ?? null
}

export async function loadInitialLocale(): Promise<SupportedLocale> {
  return resolveInitialLocale({
    getDeviceLanguageCode,
    getStoredLocale,
  })
}

export async function persistLocale(locale: SupportedLocale): Promise<void> {
  if (normalizeLocale(locale) === null) {
    return
  }

  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale)
}
