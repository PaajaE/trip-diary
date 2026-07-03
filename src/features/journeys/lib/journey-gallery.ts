import type {
  getJourneyEntryPhotoPreviews,
  PhotoPreview,
} from '@/entities/photo/api/photo-gallery.repository'

export interface JourneyGalleryMoment {
  entry: {
    id: string
    title: string | null
  }
}

export interface JourneyGalleryPhoto extends PhotoPreview {
  entryId: string
  entryTitle: string | null
}

export interface JourneyGalleryPreviews {
  failedMomentCount: number
  previewsByMoment: PhotoPreview[][]
}

type LoadJourneyGalleryBatch = typeof getJourneyEntryPhotoPreviews

export function journeyGalleryQueryKey(
  moments: JourneyGalleryMoment[],
  quality: 'detail' | 'thumb' = 'thumb',
) {
  return ['journey-gallery', quality, ...moments.map((moment) => moment.entry.id)]
}

export async function loadJourneyGalleryPreviews(
  moments: JourneyGalleryMoment[],
  loadBatch: LoadJourneyGalleryBatch,
): Promise<JourneyGalleryPreviews> {
  if (moments.length === 0) {
    return { failedMomentCount: 0, previewsByMoment: [] }
  }

  const { failedEntryIds, previewsByEntry } = await loadBatch(
    moments.map((moment) => moment.entry.id),
  )

  return {
    failedMomentCount: moments.filter((moment) =>
      failedEntryIds.has(moment.entry.id),
    ).length,
    previewsByMoment: moments.map(
      (moment) => previewsByEntry.get(moment.entry.id) ?? [],
    ),
  }
}

export function mergeJourneyGalleryPhotos(
  moments: JourneyGalleryMoment[],
  previewsByMoment: PhotoPreview[][],
): JourneyGalleryPhoto[] {
  return moments.flatMap((moment, index) =>
    (previewsByMoment[index] ?? []).map((preview) => ({
      ...preview,
      entryId: moment.entry.id,
      entryTitle: moment.entry.title,
    })),
  )
}
