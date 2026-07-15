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
import { formatJourneyDateRange, resolveDateLocale } from '@trip-diary/utils'
import { useJourneysQuery } from '@/features/journeys'
import { colors, spacing } from '@/foundation/theme'
import { useAuth } from '@/platform/auth/AuthProvider'
import { isSupabaseConfigured } from '@/platform/supabase'

export default function JourneysHomeScreen() {
  const { session, signOut } = useAuth()
  const { i18n, t } = useTranslation()
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
    statusMessageKey,
    error,
  } = useJourneysQuery(userId)

  const supabaseConfigured = isSupabaseConfigured()
  const dateLocale = resolveDateLocale(i18n.language)

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

      {showAuthoritativeEmpty ? (
        <Text style={styles.empty}>{t('dashboard.noJourneys')}</Text>
      ) : null}

      {journeys.map((journey) => {
        const dateLabel = formatJourneyDateRange(
          journey.startsAt,
          journey.endsAt,
          dateLocale,
          t('journey.dateUnknown'),
        )

        return (
          <Link key={journey.id} href={`/journey/${journey.id}`} asChild>
            <Pressable
              accessibilityHint={t('journey.explore')}
              accessibilityLabel={`${journey.title}, ${dateLabel}`}
              accessibilityRole="button"
              style={styles.card}
            >
              <Text style={styles.cardTitle}>{journey.title}</Text>
              <Text style={styles.cardMeta}>{dateLabel}</Text>
            </Pressable>
          </Link>
        )
      })}

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
    padding: spacing.md,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
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
