import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'

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
  previewsByMoment: (PhotoPreview[] | undefined)[]
}

export async function loadJourneyGalleryPreviews(
  moments: JourneyGalleryMoment[],
  loadPreviews: (entryId: string) => Promise<PhotoPreview[]>,
): Promise<JourneyGalleryPreviews> {
  const results = await Promise.allSettled(
    moments.map((moment) => loadPreviews(moment.entry.id)),
  )
  const failedMomentCount = results.filter(
    (result) => result.status === 'rejected',
  ).length

  if (results.length > 0 && failedMomentCount === results.length) {
    const reasons: unknown[] = []
    for (const result of results) {
      if (result.status === 'rejected') {
        reasons.push(result.reason as unknown)
      }
    }
    throw new AggregateError(reasons, 'Journey gallery could not be loaded')
  }

  return {
    failedMomentCount,
    previewsByMoment: results.map((result) =>
      result.status === 'fulfilled' ? result.value : undefined,
    ),
  }
}

export function mergeJourneyGalleryPhotos(
  moments: JourneyGalleryMoment[],
  previewsByMoment: (PhotoPreview[] | undefined)[],
): JourneyGalleryPhoto[] {
  return moments.flatMap((moment, index) =>
    (previewsByMoment[index] ?? []).map((preview) => ({
      ...preview,
      entryId: moment.entry.id,
      entryTitle: moment.entry.title,
    })),
  )
}
