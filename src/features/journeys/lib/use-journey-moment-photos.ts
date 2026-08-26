import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getJourneyEntryPhotoCardPreviews,
  getJourneyEntryPhotoDetailPreviews,
  getJourneyEntryPhotoPreviews,
  type PhotoPreview,
} from '@/entities/photo/api/photo-gallery.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import {
  journeyGalleryQueryKey,
  loadJourneyGalleryPreviews,
  type JourneyPhotoQuality,
} from '@/features/journeys/lib/journey-gallery'

function loadBatchForQuality(quality: JourneyPhotoQuality) {
  if (quality === 'detail') {
    return getJourneyEntryPhotoDetailPreviews
  }
  if (quality === 'card') {
    return getJourneyEntryPhotoCardPreviews
  }
  return getJourneyEntryPhotoPreviews
}

export function useJourneyMomentPhotos(
  moments: JourneyMoment[],
  enabled: boolean,
  quality: JourneyPhotoQuality = 'thumb',
): {
  isPending: boolean
  photosByEntryId: Map<string, PhotoPreview[]>
} {
  const previewsQuery = useQuery({
    enabled: enabled && moments.length > 0,
    queryFn: () =>
      loadJourneyGalleryPreviews(moments, loadBatchForQuality(quality)),
    queryKey: journeyGalleryQueryKey(moments, quality),
  })

  const photosByEntryId = useMemo(() => {
    if (previewsQuery.data === undefined) {
      return new Map<string, PhotoPreview[]>()
    }
    // Prefer entry-keyed map so shared cache works across moment orderings.
    return new Map(previewsQuery.data.previewsByEntry)
  }, [previewsQuery.data])

  return {
    isPending: previewsQuery.isPending,
    photosByEntryId,
  }
}
