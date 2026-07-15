import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { I18nextProvider } from 'react-i18next'
import { colors } from '@/foundation/theme'
import { initI18n, i18n } from '@/foundation/i18n/i18n'
import { loadInitialLocale } from '@/foundation/i18n/locale-storage'

const I18nContextProvider = I18nextProvider as ComponentType<{
  children: ReactNode
  i18n: typeof i18n
}>

export function I18nProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let isMounted = true

    void loadInitialLocale().then((locale) => {
      initI18n(locale)
      if (isMounted) {
        setReady(true)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])

  if (!ready) {
    return (
      <View
        accessibilityLabel="Loading"
        style={{
          alignItems: 'center',
          backgroundColor: colors.background,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return <I18nContextProvider i18n={i18n}>{children}</I18nContextProvider>
}
