import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { listJourneyGalleryPhotos } from '@/features/photos/api/journey-gallery.repository'
import {
  PHOTO_SIGNED_URL_STALE_TIME_MS,
  photoQueryKeys,
} from '@/features/photos/query-keys'
import { colors, spacing } from '@/foundation/theme'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'

interface JourneyGallerySectionProps {
  entryIds: string[]
  entryTitles: Map<string, string | null>
  journeyId: string
}

export function JourneyGallerySection({
  entryIds,
  entryTitles,
  journeyId,
}: JourneyGallerySectionProps) {
  const { t } = useTranslation()
  const networkState = useNetworkState()
  const isOnline = isNetworkOnline(networkState)

  const query = useQuery({
    enabled: isOnline && entryIds.length > 0,
    queryFn: () => listJourneyGalleryPhotos(journeyId, entryIds, entryTitles),
    queryKey: photoQueryKeys.journeyGallery(journeyId),
    staleTime: PHOTO_SIGNED_URL_STALE_TIME_MS,
  })

  const photos = query.data ?? []

  return (
    <View
      accessibilityLabel={t('journey.gallery')}
      style={styles.section}
      testID="journey-gallery"
    >
      <Text style={styles.title}>{t('journey.gallery')}</Text>
      <Text style={styles.eyebrow}>{t('journey.galleryEyebrow')}</Text>

      {!isOnline ? (
        <Text style={styles.stateText}>
          {t('mobile.journeyMapOfflineUnavailable')}
        </Text>
      ) : null}

      {isOnline && query.isLoading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>{t('journey.galleryLoading')}</Text>
        </View>
      ) : null}

      {query.isError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('journey.galleryError')}
        </Text>
      ) : null}

      {isOnline &&
      !query.isLoading &&
      !query.isError &&
      photos.length === 0 ? (
        <Text style={styles.stateText}>{t('journey.galleryEmpty')}</Text>
      ) : null}

      <View style={styles.grid}>
        {photos.map((photo) =>
          photo.previewUrl !== null ? (
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel={
                photo.entryTitle?.trim().length
                  ? photo.entryTitle
                  : t('journey.galleryUntitled')
              }
              key={photo.id}
              source={{ uri: photo.previewUrl }}
              style={styles.thumb}
              testID={`gallery-photo-${photo.id}`}
            />
          ) : (
            <View
              key={photo.id}
              style={[styles.thumb, styles.thumbMissing]}
              testID={`gallery-photo-missing-${photo.id}`}
            />
          ),
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  error: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  section: {
    marginTop: spacing.lg,
  },
  statePanel: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  thumb: {
    backgroundColor: '#d9d9d9',
    borderRadius: 8,
    height: 104,
    width: '31.5%',
  },
  thumbMissing: {
    borderColor: colors.border,
    borderWidth: 1,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
})
