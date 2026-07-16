import type {
  ProcessedPhoto,
  SelectedPhotoFile,
} from '@/entities/photo/lib/process-photo'

export interface JourneyMemoryPhotoDraft {
  coverIndex: number
  detectedPhotos: ProcessedPhoto[]
  locationSource: 'current' | 'map' | 'photo' | null
  photos: SelectedPhotoFile[]
  selectedPoint: { latitude: number; longitude: number } | null
}

const drafts = new Map<string, JourneyMemoryPhotoDraft>()

export function getJourneyMemoryPhotoDraft(
  journeyId: string,
): JourneyMemoryPhotoDraft | undefined {
  return drafts.get(journeyId)
}

export function setJourneyMemoryPhotoDraft(
  journeyId: string,
  draft: JourneyMemoryPhotoDraft,
): void {
  if (draft.photos.length === 0) {
    drafts.delete(journeyId)
    return
  }

  drafts.set(journeyId, draft)
}

export function clearJourneyMemoryPhotoDraft(journeyId: string): void {
  drafts.delete(journeyId)
}
