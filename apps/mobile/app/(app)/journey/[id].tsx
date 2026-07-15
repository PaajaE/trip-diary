import { Stack, useLocalSearchParams } from 'expo-router'
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
import type { JourneyHeader } from '@trip-diary/core/journey'
import { useJourneyQuery, useJourneyStopsQuery } from '@/features/journeys'
import { useAuth } from '@/platform/auth/AuthProvider'
import { JourneyMapSection } from '@/features/journeys/ui/JourneyMapSection'
import { colors, spacing } from '@/foundation/theme'

export default function JourneyDetailScreen() {
  const { id: journeyRouteId } = useLocalSearchParams<{ id: string }>()
  const id = journeyRouteId.length > 0 ? journeyRouteId : undefined
  const { session } = useAuth()
  const { i18n, t } = useTranslation()
  const userId = session?.user.id
  const { data, error, isLoading, isRevalidating, refetch } =
    useJourneyQuery(id)
  const {
    isFetching: isStopsFetching,
    refetch: refetchStops,
  } = useJourneyStopsQuery(userId, id)

  if (id === undefined) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={styles.error}>
          {t('mobile.missingJourneyId')}
        </Text>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          accessibilityLabel={t('journey.loading')}
          color={colors.primary}
          size="large"
        />
      </View>
    )
  }

  if (error !== null && data === undefined) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={styles.error}>
          {error.message}
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
    )
  }

  if (data === undefined) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={styles.error}>
          {t('journey.notFound')}
        </Text>
      </View>
    )
  }

  const { isOffline, journey } = data
  const dateLocale = resolveDateLocale(i18n.language)
  const dateLabel = formatJourneyDateRange(
    journey.startsAt,
    journey.endsAt,
    dateLocale,
    t('journey.dateUnknown'),
  )
  const statusLabel = translateJourneyStatus(journey, t)

  return (
    <>
      <Stack.Screen options={{ title: journey.title }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => {
              void refetch()
              void refetchStops()
            }}
            refreshing={isRevalidating || isStopsFetching}
            tintColor={colors.primary}
          />
        }
      >
        {isOffline ? (
          <View accessibilityRole="text" style={styles.offlineBanner}>
            <Text style={styles.offlineText}>{t('sync.status.offline')}</Text>
          </View>
        ) : null}

        <Text style={styles.summary}>
          {journey.summary.trim().length > 0
            ? journey.summary
            : t('dashboard.noSummary')}
        </Text>
        <Text style={styles.meta}>
          {dateLabel} · {statusLabel}
        </Text>

        {session?.user.id !== undefined ? (
          <JourneyMapSection
            journeyId={journey.id}
            userId={session.user.id}
          />
        ) : null}
      </ScrollView>
    </>
  )
}

function translateJourneyStatus(
  journey: JourneyHeader,
  t: (key: string) => string,
): string {
  return t(`journey.status.${journey.status}`)
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.lg,
  },
  error: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  offlineBanner: {
    backgroundColor: '#fff4d6',
    borderColor: '#e8c468',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  offlineText: {
    color: '#7a5b00',
    fontSize: 14,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  retryText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  summary: {
    color: '#3f463c',
    fontSize: 16,
    lineHeight: 24,
  },
})
