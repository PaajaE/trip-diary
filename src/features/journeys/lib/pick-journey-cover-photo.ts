import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import {
  sortJourneyMomentsNewestFirst,
  type JourneyMoment,
} from '@/features/journeys/lib/journey-content'

export function pickJourneyCoverPhoto(
  moments: JourneyMoment[],
  photosByEntryId: Map<string, PhotoPreview[]>,
): PhotoPreview | null {
  for (const moment of sortJourneyMomentsNewestFirst(moments)) {
    const photos = photosByEntryId.get(moment.entry.id) ?? []
    if (photos.length > 0) {
      return photos[0] ?? null
    }
  }

  return null
}
