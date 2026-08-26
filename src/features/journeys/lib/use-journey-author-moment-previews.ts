import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getEntryPhotoCounts,
  getJourneyEntryPhotoAuthorCardPreviews,
  type PhotoPreview,
} from '@/entities/photo/api/photo-gallery.repository'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'

export function useJourneyAuthorMomentPreviews(
  moments: JourneyMoment[],
  enabled: boolean,
): {
  isPending: boolean
  photoCount: number
  photoCountsByEntry: Map<string, number>
  previewsByEntry: Map<string, PhotoPreview[]>
} {
  const entryIds = useMemo(
    () => [...new Set(moments.map((moment) => moment.entry.id))].sort(),
    [moments],
  )

  const previewsQuery = useQuery({
    enabled: enabled && entryIds.length > 0,
    queryFn: async () => {
      const [previews, photoCountsByEntry] = await Promise.all([
        getJourneyEntryPhotoAuthorCardPreviews(entryIds),
        getEntryPhotoCounts(entryIds),
      ])
      return {
        failedEntryIds: previews.failedEntryIds,
        photoCountsByEntry,
        previewsByEntry: previews.previewsByEntry,
      }
    },
    queryKey: photoQueryKeys.journeyAuthorMomentPreviews(entryIds),
  })

  const previewsByEntry = useMemo(() => {
    if (previewsQuery.data === undefined) {
      return new Map<string, PhotoPreview[]>()
    }
    return new Map(previewsQuery.data.previewsByEntry)
  }, [previewsQuery.data])

  const photoCountsByEntry = useMemo(() => {
    if (previewsQuery.data === undefined) {
      return new Map<string, number>()
    }
    return new Map(previewsQuery.data.photoCountsByEntry)
  }, [previewsQuery.data])

  const photoCount = useMemo(() => {
    let total = 0
    for (const count of photoCountsByEntry.values()) {
      total += count
    }
    return total
  }, [photoCountsByEntry])

  return {
    isPending: previewsQuery.isPending,
    photoCount,
    photoCountsByEntry,
    previewsByEntry,
  }
}
