import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useMemo, type ComponentType, type ReactNode } from 'react'
import { en } from '@trip-diary/i18n'
import { AuthProvider } from '@/platform/auth/AuthProvider'
import { ConfigurationError, validateExpoPublicEnv } from '@/foundation/env'
import { ErrorFallback } from '@/foundation/error-boundary/ErrorFallback'
import { RootErrorBoundary } from '@/foundation/error-boundary/RootErrorBoundary'
import { I18nProvider } from '@/foundation/i18n/I18nProvider'
import { NetworkProvider } from '@/foundation/network/NetworkProvider'
import { createQueryClient } from '@/foundation/query-client'
import { SyncLifecycleProvider } from '@/foundation/sync/SyncLifecycleProvider'

const RootStack = Stack as ComponentType<{
  children?: ReactNode
  screenOptions?: { headerShown?: boolean }
}> & {
  Screen: ComponentType<Record<string, unknown>>
}

let cachedStartupConfigurationError: ConfigurationError | null | undefined

function getStartupConfigurationError(): ConfigurationError | null {
  if (cachedStartupConfigurationError === undefined) {
    try {
      validateExpoPublicEnv()
      cachedStartupConfigurationError = null
    } catch (error) {
      if (error instanceof ConfigurationError) {
        cachedStartupConfigurationError = error
      } else {
        throw error
      }
    }
  }

  return cachedStartupConfigurationError
}

function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => createQueryClient(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <NetworkProvider>
          <AuthProvider>
            <SyncLifecycleProvider>{children}</SyncLifecycleProvider>
          </AuthProvider>
        </NetworkProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}

function RootNavigator() {
  return (
    <>
      <StatusBar style="auto" />
      <RootStack screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="(app)" options={{ headerShown: false }} />
        <RootStack.Screen name="(auth)" options={{ headerShown: false }} />
      </RootStack>
    </>
  )
}

export default function RootLayout() {
  const configurationError = getStartupConfigurationError()

  if (configurationError !== null) {
    return (
      <ErrorFallback
        error={configurationError}
        title={en.mobile.configurationError}
      />
    )
  }

  return (
    <RootErrorBoundary>
      <AppProviders>
        <RootNavigator />
      </AppProviders>
    </RootErrorBoundary>
  )
}
