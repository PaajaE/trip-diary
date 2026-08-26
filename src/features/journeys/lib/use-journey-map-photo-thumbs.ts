import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getJourneyEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import {
  journeyGalleryQueryKey,
  loadJourneyGalleryPreviews,
  mergeJourneyGalleryPhotos,
  type JourneyGalleryMoment,
  type JourneyGalleryPreviews,
} from '@/features/journeys/lib/journey-gallery'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'

function isJourneyGalleryPreviews(
  value: unknown,
): value is JourneyGalleryPreviews {
  return (
    typeof value === 'object' &&
    value !== null &&
    'previewsByEntry' in value &&
    'previewsByMoment' in value &&
    Array.isArray((value as JourneyGalleryPreviews).previewsByMoment)
  )
}

export function useJourneyMapPhotoThumbs(
  moments: JourneyGalleryMoment[],
): Record<string, string> {
  const previewsQuery = useQuery({
    queryFn: () =>
      loadJourneyGalleryPreviews(moments, getJourneyEntryPhotoPreviews),
    queryKey: journeyGalleryQueryKey(moments),
  })
  const previewData = isJourneyGalleryPreviews(previewsQuery.data)
    ? previewsQuery.data
    : null
  const photos = useMemo(
    () =>
      mergeJourneyGalleryPhotos(moments, previewData?.previewsByMoment ?? []),
    [moments, previewData?.previewsByMoment],
  )
  const photosWithUrls = usePhotoObjectUrls(photos)

  return useMemo(
    () =>
      Object.fromEntries(photosWithUrls.map((photo) => [photo.id, photo.url])),
    [photosWithUrls],
  )
}
