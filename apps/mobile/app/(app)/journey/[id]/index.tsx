import { Link, Stack, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
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
import { useQueryClient } from '@tanstack/react-query'
import { formatJourneyDateRange, resolveDateLocale } from '@trip-diary/utils'
import type { JourneyHeader } from '@trip-diary/core/journey'
import {
  journeyQueryKeys,
  useJourneyQuery,
  useJourneyStopsQuery,
} from '@/features/journeys'
import { useJourneyFullDetailQuery } from '@/features/journeys/use-journey-full-detail-query'
import { JourneyContentSection } from '@/features/journeys/ui/JourneyContentSection'
import { JourneyGallerySection } from '@/features/journeys/ui/JourneyGallerySection'
import { JourneyMapSection } from '@/features/journeys/ui/JourneyMapSection'
import { photoQueryKeys } from '@/features/photos/query-keys'
import { useAuth } from '@/platform/auth/AuthProvider'
import { colors, spacing } from '@/foundation/theme'

export default function JourneyDetailScreen() {
  const { id: journeyRouteId } = useLocalSearchParams<{ id: string }>()
  const id = journeyRouteId.length > 0 ? journeyRouteId : undefined
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const { i18n, t } = useTranslation()
  const userId = session?.user.id
  const { data, error, isLoading, isRevalidating, refetch } =
    useJourneyQuery(id)
  const {
    data: contentData,
    isFetching: isContentFetching,
    refetch: refetchContent,
  } = useJourneyFullDetailQuery(id)
  const { isFetching: isStopsFetching, refetch: refetchStops } =
    useJourneyStopsQuery(userId, id)

  const entryIds = useMemo(
    () => contentData?.detail.entries.map((entry) => entry.id) ?? [],
    [contentData],
  )
  const entryTitles = useMemo(() => {
    const titles = new Map<string, string | null>()
    for (const entry of contentData?.detail.entries ?? []) {
      titles.set(entry.id, entry.title)
    }
    return titles
  }, [contentData])

  function refreshAll(): void {
    void refetch()
    void refetchContent()
    void refetchStops()
    if (id !== undefined) {
      void queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.content(id),
      })
      void queryClient.invalidateQueries({
        queryKey: photoQueryKeys.journeyGallery(id),
      })
      void queryClient.invalidateQueries({
        queryKey: photoQueryKeys.journeyPhotoLocations(id),
      })
    }
  }

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
  const fullDetail = contentData?.detail

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <Link
                href={{
                  pathname: '/journey/[id]/moment/new',
                  params: { id: journey.id },
                }}
                asChild
              >
                <Pressable
                  accessibilityLabel={t('journey.add')}
                  accessibilityRole="button"
                  style={styles.headerButton}
                  testID="journey-add-moment"
                >
                  <Text style={styles.headerButtonText}>
                    {t('journey.add')}
                  </Text>
                </Pressable>
              </Link>
              <Link
                href={{
                  pathname: '/journey/[id]/manage',
                  params: { id: journey.id },
                }}
                asChild
              >
                <Pressable
                  accessibilityRole="button"
                  style={styles.headerButton}
                >
                  <Text style={styles.headerButtonText}>
                    {t('journey.manageTrip')}
                  </Text>
                </Pressable>
              </Link>
            </View>
          ),
          title: journey.title,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={refreshAll}
            refreshing={isRevalidating || isStopsFetching || isContentFetching}
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

        {fullDetail !== undefined ? (
          <JourneyContentSection journey={fullDetail} />
        ) : null}

        {fullDetail !== undefined ? (
          <JourneyGallerySection
            entryIds={entryIds}
            entryTitles={entryTitles}
            journeyId={journey.id}
          />
        ) : null}

        {session?.user.id !== undefined ? (
          <JourneyMapSection journeyId={journey.id} userId={session.user.id} />
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
    paddingBottom: spacing.xl * 2,
  },
  error: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  headerButton: {
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  headerButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
