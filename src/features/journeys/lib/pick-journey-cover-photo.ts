import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'

export function pickJourneyCoverPhoto(
  moments: JourneyMoment[],
  photosByEntryId: Map<string, PhotoPreview[]>,
): PhotoPreview | null {
  const sorted = [...moments].sort((left, right) =>
    (right.entry.eventAt ?? '').localeCompare(left.entry.eventAt ?? ''),
  )

  for (const moment of sorted) {
    const photos = photosByEntryId.get(moment.entry.id) ?? []
    if (photos.length > 0) {
      return photos[0] ?? null
    }
  }

  return null
}
