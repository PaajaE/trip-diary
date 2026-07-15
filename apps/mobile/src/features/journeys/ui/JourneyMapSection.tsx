import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { computeJourneyStopMapCamera } from '@trip-diary/utils'
import { resolveJourneyMapPresentation } from '@/features/journeys/journey-map-presentation'
import { toMappableJourneyStops } from '@/features/journeys/lib/journey-map-stops'
import { useJourneyStopsQuery } from '@/features/journeys/use-journey-stops-query'
import { colors, spacing } from '@/foundation/theme'
import {
  MapViewScreen,
  type MapStopMarker,
} from '@/platform/maps/MapViewScreen'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'
import { isSupabaseConfigured } from '@/platform/supabase'

interface JourneyMapSectionProps {
  journeyId: string
  userId: string
}

export function JourneyMapSection({
  journeyId,
  userId,
}: JourneyMapSectionProps) {
  const { t } = useTranslation()
  const networkState = useNetworkState()
  const isOnline = isNetworkOnline(networkState)
  const {
    data: stops,
    error,
    isError,
    isLoading,
    isFetched,
    refetch,
    result,
  } = useJourneyStopsQuery(userId, journeyId)

  const mappableStops = useMemo(() => toMappableJourneyStops(stops), [stops])
  const camera = useMemo(
    () => computeJourneyStopMapCamera(mappableStops),
    [mappableStops],
  )
  const presentation = resolveJourneyMapPresentation({
    camera,
    isError,
    isFetched,
    isLoading,
    isOnline,
    mappableStops,
    result,
    supabaseConfigured: isSupabaseConfigured(),
  })

  const markers = useMemo<MapStopMarker[]>(
    () =>
      mappableStops.map((stop) => ({
        accessibilityLabel: t('mobile.journeyMapStopLabel', {
          status: t(`journey.stopStatus.${stop.status}`),
          title: stop.title,
        }),
        id: stop.id,
        latitude: stop.latitude,
        longitude: stop.longitude,
        status: stop.status,
        title: stop.title,
      })),
    [mappableStops, t],
  )

  const showMap =
    camera !== null &&
    mappableStops.length > 0 &&
    !presentation.showInitialLoading &&
    !presentation.showRemoteError &&
    !presentation.showMapUnavailable

  return (
    <View
      accessibilityLabel={t('mobile.journeyMapSectionLabel')}
      style={styles.mapSection}
    >
      <Text style={styles.sectionTitle}>{t('journey.map')}</Text>

      {presentation.showCachedBanner &&
      presentation.statusMessageKey !== null ? (
        <View accessibilityRole="text" style={styles.cachedBanner}>
          <Text style={styles.cachedBannerText}>
            {t(presentation.statusMessageKey)}
          </Text>
        </View>
      ) : null}

      {presentation.showInitialLoading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator
            accessibilityLabel={t('mobile.journeyMapLoading')}
            color={colors.primary}
          />
          <Text style={styles.stateText}>{t('mobile.journeyMapLoading')}</Text>
        </View>
      ) : null}

      {presentation.showRemoteError ? (
        <View accessibilityRole="alert" style={styles.errorPanel}>
          <Text style={styles.errorText}>
            {error?.message ?? t('mobile.journeyMapError')}
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

      {presentation.showMapUnavailable ? (
        <Text accessibilityRole="alert" style={styles.stateText}>
          {t('mobile.journeyMapOfflineUnavailable')}
        </Text>
      ) : null}

      {presentation.showAuthoritativeEmpty ? (
        <Text style={styles.stateText}>{t('mobile.journeyMapNoStops')}</Text>
      ) : null}

      {presentation.showNoMappableStops ? (
        <Text style={styles.stateText}>
          {t('mobile.journeyMapNoLocatedStops')}
        </Text>
      ) : null}

      {showMap ? (
        <View style={styles.mapContainer}>
          <MapViewScreen camera={camera} markers={markers} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
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
  errorPanel: {
    backgroundColor: '#fde8e8',
    borderColor: '#f5b7b7',
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 15,
    lineHeight: 22,
  },
  mapContainer: {
    height: 280,
    marginTop: spacing.xs,
  },
  mapSection: {
    marginTop: spacing.lg,
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
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  statePanel: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
    paddingVertical: spacing.md,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
})
