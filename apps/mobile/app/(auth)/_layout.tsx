import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { type ComponentType } from 'react'
import { resolveAuthNavigation } from '@/foundation/navigation/auth-guard'
import { appStackScreenOptions } from '@/foundation/navigation/screen-options'
import { colors } from '@/foundation/theme'
import { useAuth } from '@/platform/auth/AuthProvider'

const AuthStack = Stack as ComponentType<Record<string, unknown>>

export default function AuthGroupLayout() {
  const { isLoading, session } = useAuth()
  const { t } = useTranslation()
  const decision = resolveAuthNavigation({
    authLoading: isLoading,
    guard: 'auth',
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
    <AuthStack screenOptions={{ ...appStackScreenOptions, headerShown: true }}>
      <Stack.Screen
        name="sign-in"
        options={{ title: t('auth.signIn.title') }}
      />
    </AuthStack>
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
