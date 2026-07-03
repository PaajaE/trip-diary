import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getJourneyEntryPhotoDetailPreviews,
  getJourneyEntryPhotoPreviews,
  type PhotoPreview,
} from '@/entities/photo/api/photo-gallery.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { loadJourneyGalleryPreviews } from '@/features/journeys/lib/journey-gallery'

export function useJourneyMomentPhotos(
  moments: JourneyMoment[],
  enabled: boolean,
  quality: 'detail' | 'thumb' = 'thumb',
): {
  isPending: boolean
  photosByEntryId: Map<string, PhotoPreview[]>
} {
  const previewsQuery = useQuery({
    enabled: enabled && moments.length > 0,
    queryFn: () =>
      loadJourneyGalleryPreviews(
        moments,
        quality === 'detail'
          ? getJourneyEntryPhotoDetailPreviews
          : getJourneyEntryPhotoPreviews,
      ),
    queryKey: [
      'journey-gallery',
      quality,
      ...moments.map((moment) => moment.entry.id),
    ],
  })

  const photosByEntryId = useMemo(() => {
    const map = new Map<string, PhotoPreview[]>()
    if (previewsQuery.data === undefined) {
      return map
    }

    moments.forEach((moment, index) => {
      map.set(moment.entry.id, previewsQuery.data.previewsByMoment[index] ?? [])
    })
    return map
  }, [moments, previewsQuery.data])

  return {
    isPending: previewsQuery.isPending,
    photosByEntryId,
  }
}
