import type {
  getJourneyEntryPhotoPreviews,
  PhotoPreview,
} from '@/entities/photo/api/photo-gallery.repository'
import {
  photoQueryKeys,
  type JourneyPhotoQuality,
} from '@/entities/photo/api/photo-query-keys'

export type { JourneyPhotoQuality }

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
  /** Entry-id keyed map — safe to share across differently ordered moment lists. */
  previewsByEntry: Map<string, PhotoPreview[]>
  previewsByMoment: PhotoPreview[][]
}

type LoadJourneyGalleryBatch = typeof getJourneyEntryPhotoPreviews

export function journeyGalleryQueryKey(
  moments: JourneyGalleryMoment[],
  quality: JourneyPhotoQuality = 'thumb',
) {
  // Sort so page / gallery / strip share one React Query cache per quality.
  const entryIds = [...new Set(moments.map((moment) => moment.entry.id))].sort()
  return photoQueryKeys.journeyGallery(entryIds, quality)
}

export async function loadJourneyGalleryPreviews(
  moments: JourneyGalleryMoment[],
  loadBatch: LoadJourneyGalleryBatch,
): Promise<JourneyGalleryPreviews> {
  if (moments.length === 0) {
    return {
      failedMomentCount: 0,
      previewsByEntry: new Map(),
      previewsByMoment: [],
    }
  }

  const { failedEntryIds, previewsByEntry } = await loadBatch(
    moments.map((moment) => moment.entry.id),
  )

  return {
    failedMomentCount: moments.filter((moment) =>
      failedEntryIds.has(moment.entry.id),
    ).length,
    previewsByEntry,
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

export function mergeJourneyGalleryPhotosByEntry(
  moments: JourneyGalleryMoment[],
  previewsByEntry: Map<string, PhotoPreview[]>,
): JourneyGalleryPhoto[] {
  return moments.flatMap((moment) =>
    (previewsByEntry.get(moment.entry.id) ?? []).map((preview) => ({
      ...preview,
      entryId: moment.entry.id,
      entryTitle: moment.entry.title,
    })),
  )
}
