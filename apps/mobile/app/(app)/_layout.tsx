import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { type ComponentType } from 'react'
import { SyncStatusHeaderButton } from '@/features/sync'
import { resolveAuthNavigation } from '@/foundation/navigation/auth-guard'
import { appStackScreenOptions } from '@/foundation/navigation/screen-options'
import { colors } from '@/foundation/theme'
import { useAuth } from '@/platform/auth/AuthProvider'

const AppStack = Stack as ComponentType<Record<string, unknown>>

export default function AppGroupLayout() {
  const { isLoading, session } = useAuth()
  const { t } = useTranslation()
  const decision = resolveAuthNavigation({
    authLoading: isLoading,
    guard: 'app',
    session,
  })

  if (decision.type === 'loading') {
    return (
      <View
        accessibilityLabel={t('navigation.loading')}
        style={styles.centered}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  if (decision.type === 'redirect') {
    return <Redirect href={decision.href} />
  }

  return (
    <AppStack
      screenOptions={{
        ...appStackScreenOptions,
        headerRight: () => <SyncStatusHeaderButton />,
        headerShown: true,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('dashboard.yourTrips') }}
      />
      <Stack.Screen
        name="journey/new"
        options={{ title: t('journey.createTitle') }}
      />
      <Stack.Screen name="journey/[id]" options={{ headerShown: false }} />
      {__DEV__ ? (
        <Stack.Screen
          name="dev-checklist"
          options={{ title: t('mobile.devChecklist') }}
        />
      ) : null}
    </AppStack>
  )
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
})
