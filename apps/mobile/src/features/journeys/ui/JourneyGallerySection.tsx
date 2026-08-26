import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { listJourneyGalleryPhotos } from '@/features/photos/api/journey-gallery.repository'
import { JourneyGalleryVideoPlayer } from '@/features/journeys/ui/JourneyGalleryVideoPlayer'
import { createSignedPhotoUrl } from '@/features/photos/api/signed-photo-url'
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
  const [playingPhotoId, setPlayingPhotoId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoLoading, setVideoLoading] = useState(false)

  const query = useQuery({
    enabled: isOnline && entryIds.length > 0,
    queryFn: () => listJourneyGalleryPhotos(journeyId, entryIds, entryTitles),
    queryKey: photoQueryKeys.journeyGallery(journeyId),
    staleTime: PHOTO_SIGNED_URL_STALE_TIME_MS,
  })

  const photos = query.data ?? []

  async function openVideoPlayer(
    photoId: string,
    videoStoragePath: string | null,
  ): Promise<void> {
    if (videoStoragePath === null || videoStoragePath.trim().length === 0) {
      return
    }

    setPlayingPhotoId(photoId)
    setVideoLoading(true)
    setVideoUrl(null)

    try {
      const signed = await createSignedPhotoUrl(videoStoragePath)
      setVideoUrl(signed)
    } finally {
      setVideoLoading(false)
    }
  }

  function closeVideoPlayer(): void {
    setPlayingPhotoId(null)
    setVideoUrl(null)
    setVideoLoading(false)
  }

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

      {isOnline && !query.isLoading && !query.isError && photos.length === 0 ? (
        <Text style={styles.stateText}>{t('journey.galleryEmpty')}</Text>
      ) : null}

      <View style={styles.grid}>
        {photos.map((photo) => {
          const label = photo.entryTitle?.trim().length
            ? photo.entryTitle
            : t('journey.galleryUntitled')

          if (photo.previewUrl === null) {
            return (
              <View
                key={photo.id}
                style={[styles.thumb, styles.thumbMissing]}
                testID={`gallery-photo-missing-${photo.id}`}
              />
            )
          }

          const isVideo = photo.mediaType === 'video'

          return (
            <Pressable
              accessibilityLabel={label}
              accessibilityRole="button"
              disabled={isVideo && photo.videoStoragePath === null}
              key={photo.id}
              onPress={() => {
                if (isVideo) {
                  void openVideoPlayer(photo.id, photo.videoStoragePath)
                }
              }}
              style={styles.thumbWrap}
              testID={`gallery-photo-${photo.id}`}
            >
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: photo.previewUrl }}
                style={styles.thumb}
              />
              {isVideo ? (
                <View pointerEvents="none" style={styles.playBadge}>
                  <Text style={styles.playBadgeText}>▶</Text>
                </View>
              ) : null}
            </Pressable>
          )
        })}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={closeVideoPlayer}
        transparent
        visible={playingPhotoId !== null}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            {videoLoading ? (
              <ActivityIndicator color={colors.primary} size="large" />
            ) : videoUrl !== null ? (
              <JourneyGalleryVideoPlayer url={videoUrl} />
            ) : (
              <Text style={styles.stateText}>{t('journey.galleryError')}</Text>
            )}
            <Pressable
              accessibilityLabel={t('common.cancel')}
              accessibilityRole="button"
              onPress={closeVideoPlayer}
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalClose: {
    alignItems: 'center',
    marginTop: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  modalCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalPanel: {
    alignItems: 'center',
    width: '100%',
  },
  playBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -16,
    marginTop: -16,
    position: 'absolute',
    top: '50%',
    width: 32,
  },
  playBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
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
    width: '100%',
  },
  thumbMissing: {
    borderColor: colors.border,
    borderWidth: 1,
    width: '31.5%',
  },
  thumbWrap: {
    position: 'relative',
    width: '31.5%',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
})
