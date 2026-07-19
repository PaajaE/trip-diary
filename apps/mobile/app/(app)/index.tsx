import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useJourneysQuery } from '@/features/journeys'
import { resolveJourneyListCreateCta } from '@/features/journeys/journey-list-create-cta'
import { JourneyListCardContent } from '@/features/journeys/ui/JourneyListCardContent'
import { colors, spacing } from '@/foundation/theme'
import { useAuth } from '@/platform/auth/AuthProvider'
import { isSupabaseConfigured } from '@/platform/supabase'

export default function JourneysHomeScreen() {
  const { session, signOut } = useAuth()
  const { t } = useTranslation()
  const userId = session?.user.id
  const {
    data: journeys,
    isOnline,
    isRefetching,
    refetch,
    showAuthoritativeEmpty,
    showCachedBanner,
    showInitialLoading,
    showOfflineUnavailable,
    showRemoteError,
    showSpaceUnresolved,
    statusMessageKey,
    error,
    spaceError,
  } = useJourneysQuery(userId)

  const supabaseConfigured = isSupabaseConfigured()
  const canAttemptCreate = supabaseConfigured && isOnline
  const createCta = resolveJourneyListCreateCta({
    canAttemptCreate,
    isOnline,
    journeysCount: journeys.length,
    presentation: {
      showAuthoritativeEmpty,
      showInitialLoading,
      showOfflineUnavailable,
      showRemoteError,
      showSpaceUnresolved,
    },
  })

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        supabaseConfigured ? (
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void refetch()}
            refreshing={isRefetching}
            tintColor={colors.primary}
          />
        ) : undefined
      }
    >
      <Text style={styles.description}>{t('dashboard.description')}</Text>

      {createCta === 'header' ? (
        <Link href="/journey/new" asChild>
          <Pressable
            accessibilityLabel={t('dashboard.addJourney')}
            accessibilityRole="button"
            style={styles.createButton}
            testID="create-journey-cta"
          >
            <Text style={styles.createButtonText}>
              {t('dashboard.addJourney')}
            </Text>
          </Pressable>
        </Link>
      ) : null}

      {createCta === 'offline-hint' ? (
        <Text accessibilityRole="text" style={styles.hint}>
          {t('mobile.journeyCreateRequiresConnection')}
        </Text>
      ) : null}

      {!supabaseConfigured ? (
        <Text accessibilityRole="text" style={styles.hint}>
          {t('mobile.supabaseNotConfigured')}
        </Text>
      ) : null}

      {showCachedBanner && statusMessageKey !== null ? (
        <View accessibilityRole="text" style={styles.cachedBanner}>
          <Text style={styles.cachedBannerText}>{t(statusMessageKey)}</Text>
        </View>
      ) : null}

      {showInitialLoading ? (
        <ActivityIndicator
          accessibilityLabel={t('dashboard.loading')}
          color={colors.primary}
          style={styles.loader}
        />
      ) : null}

      {showSpaceUnresolved ? (
        <View accessibilityRole="alert" style={styles.errorPanel}>
          <Text style={styles.error}>
            {spaceError?.message ?? t('mobile.journeyListSpaceUnresolved')}
          </Text>
          <Pressable
            accessibilityLabel={t('common.tryAgain')}
            accessibilityRole="button"
            onPress={() => void refetch()}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>{t('common.tryAgain')}</Text>
          </Pressable>
        </View>
      ) : null}

      {showRemoteError ? (
        <View accessibilityRole="alert" style={styles.errorPanel}>
          <Text style={styles.error}>
            {error?.message ?? t('dashboard.error')}
          </Text>
          <Pressable
            accessibilityLabel={t('common.tryAgain')}
            accessibilityRole="button"
            onPress={() => void refetch()}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>{t('common.tryAgain')}</Text>
          </Pressable>
        </View>
      ) : null}

      {showOfflineUnavailable ? (
        <Text accessibilityRole="alert" style={styles.empty}>
          {t('mobile.journeyListOfflineUnavailable')}
        </Text>
      ) : null}

      {showAuthoritativeEmpty && createCta === 'empty' ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.empty}>{t('dashboard.noJourneys')}</Text>
          <Link href="/journey/new" asChild>
            <Pressable
              accessibilityLabel={t('dashboard.addJourney')}
              accessibilityRole="button"
              style={styles.emptyCreateButton}
              testID="create-journey-empty-cta"
            >
              <Text style={styles.createButtonText}>
                {t('dashboard.addJourney')}
              </Text>
            </Pressable>
          </Link>
        </View>
      ) : null}

      {showAuthoritativeEmpty && createCta !== 'empty' ? (
        <Text style={styles.empty}>{t('dashboard.noJourneys')}</Text>
      ) : null}

      {journeys.map((journey) => (
        <Link key={journey.id} href={`/journey/${journey.id}`} asChild>
          <Pressable
            accessibilityHint={t('journey.explore')}
            accessibilityLabel={journey.title}
            accessibilityRole="button"
            style={styles.card}
          >
            <JourneyListCardContent journey={journey} />
          </Pressable>
        </Link>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={styles.signOutButton}
      >
        <Text style={styles.signOutText}>{t('navigation.signOut')}</Text>
      </Pressable>

      {__DEV__ ? (
        <Link href="/dev-checklist" style={styles.devLink}>
          {t('mobile.devChecklist')}
        </Link>
      ) : null}

      {!isOnline && supabaseConfigured ? (
        <Text accessibilityRole="text" style={styles.refreshHint}>
          {t('mobile.journeyListPullToRefreshOffline')}
        </Text>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: spacing.sm,
    minHeight: 48,
    overflow: 'hidden',
    padding: spacing.md,
  },
  cachedBanner: {
    backgroundColor: '#fff4d6',
    borderColor: '#e8c468',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  cachedBannerText: {
    color: '#7a5b00',
    fontSize: 14,
    fontWeight: '600',
  },
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.lg,
  },
  createButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    marginBottom: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  devLink: {
    color: colors.primary,
    fontSize: 15,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  emptyCreateButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  emptyPanel: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.error,
    fontSize: 15,
    lineHeight: 22,
  },
  errorPanel: {
    backgroundColor: '#fde8e8',
    borderColor: '#f5b7b7',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  loader: {
    marginTop: spacing.sm,
  },
  refreshHint: {
    color: colors.textSubtle,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  retryText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  signOutButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  signOutText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
})
