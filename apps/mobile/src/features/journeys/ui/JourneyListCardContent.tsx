import { useQuery } from '@tanstack/react-query'
import { Image, StyleSheet, Text, View } from 'react-native'
import { formatJourneyDateRange, resolveDateLocale } from '@trip-diary/utils'
import { useTranslation } from 'react-i18next'
import type { JourneyListItem } from '@trip-diary/core/journey'
import { resolveJourneyCoverPreviewUrl } from '@/features/photos/api/journey-gallery.repository'
import {
  PHOTO_SIGNED_URL_STALE_TIME_MS,
  photoQueryKeys,
} from '@/features/photos/query-keys'
import { colors, spacing } from '@/foundation/theme'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'

interface JourneyListCardProps {
  journey: JourneyListItem
}

export function JourneyListCardContent({ journey }: JourneyListCardProps) {
  const { i18n, t } = useTranslation()
  const dateLocale = resolveDateLocale(i18n.language)
  const dateLabel = formatJourneyDateRange(
    journey.startsAt,
    journey.endsAt,
    dateLocale,
    t('journey.dateUnknown'),
  )
  const networkState = useNetworkState()
  const isOnline = isNetworkOnline(networkState)
  const coverQuery = useQuery({
    enabled: isOnline,
    queryFn: () => resolveJourneyCoverPreviewUrl(journey.id),
    queryKey: photoQueryKeys.journeyListCover(journey.id),
    staleTime: PHOTO_SIGNED_URL_STALE_TIME_MS,
  })

  const coverUrl = coverQuery.data ?? null

  return (
    <View>
      {coverUrl !== null ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: coverUrl }}
          style={styles.cover}
        />
      ) : null}
      <Text style={styles.cardTitle}>{journey.title}</Text>
      <Text style={styles.cardMeta}>{dateLabel}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
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
  cover: {
    backgroundColor: '#d9d9d9',
    borderRadius: 8,
    height: 140,
    marginBottom: spacing.sm,
    width: '100%',
  },
})
