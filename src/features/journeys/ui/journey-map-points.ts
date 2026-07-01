import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { NatureObservation } from '@/entities/nature/model/observation'
import type { JourneyPhotoLocation } from '@/entities/photo/api/photo-location.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'

export type JourneyMapPointType = 'moment' | 'photo' | 'planned' | 'nature-goal'

export interface JourneyMapPoint {
  category: JourneyChecklistItem['category'] | null
  checked: boolean
  checklistItemId: string | null
  entryId: string | null
  id: string
  latitude: number
  longitude: number
  notes: string
  photoId: string | null
  stopId: string | null
  title: string
  type: JourneyMapPointType
}

export interface JourneyMapPointsInput {
  checklistItems?: JourneyChecklistItem[]
  observations?: NatureObservation[]
}

export function getJourneyMapPoints(
  moments: JourneyMoment[],
  plannedStops: JourneyDetail['stops'],
  photoLocations: JourneyPhotoLocation[] = [],
  input: JourneyMapPointsInput = {},
): JourneyMapPoint[] {
  const checklistItems = input.checklistItems ?? []
  const observations = input.observations ?? []
  const points: JourneyMapPoint[] = []
  const usedPhotoIds = new Set<string>()
  const entriesWithPhotoPins = new Set<string>()
  const usedEntryIds = new Set<string>()
  const usedStopIds = new Set<string>()
  const photoIdByEntryId = new Map<string, string>()
  const observationByChecklistId = new Map<string, NatureObservation>()
  const checklistByStopId = new Map<string, JourneyChecklistItem>()

  for (const photo of photoLocations) {
    if (!photoIdByEntryId.has(photo.entryId)) {
      photoIdByEntryId.set(photo.entryId, photo.id)
    }
  }

  for (const observation of observations) {
    if (observation.checklistItemId === null) {
      continue
    }
    if (!observationByChecklistId.has(observation.checklistItemId)) {
      observationByChecklistId.set(observation.checklistItemId, observation)
    }
  }

  for (const item of checklistItems) {
    if (item.stopId !== null) {
      checklistByStopId.set(item.stopId, item)
    }
  }

  for (const photo of photoLocations) {
    const coordinates = getValidCoordinates(photo.latitude, photo.longitude)
    if (coordinates === null || usedPhotoIds.has(photo.id)) {
      continue
    }

    usedPhotoIds.add(photo.id)
    entriesWithPhotoPins.add(photo.entryId)
    points.push({
      category: null,
      checked: false,
      checklistItemId: null,
      entryId: photo.entryId,
      id: `photo:${photo.id}`,
      photoId: photo.id,
      stopId: null,
      notes: '',
      ...coordinates,
      title: photo.entryTitle ?? '',
      type: 'photo',
    })
  }

  for (const moment of moments) {
    if (
      moment.location === null ||
      usedEntryIds.has(moment.entry.id) ||
      entriesWithPhotoPins.has(moment.entry.id)
    ) {
      continue
    }
    const coordinates = getValidCoordinates(
      moment.location.latitude,
      moment.location.longitude,
    )
    if (coordinates === null) {
      continue
    }

    usedEntryIds.add(moment.entry.id)
    if (moment.stop !== null) {
      usedStopIds.add(moment.stop.id)
    }
    points.push({
      category: null,
      checked: false,
      checklistItemId: null,
      entryId: moment.entry.id,
      id: `moment:${moment.entry.id}`,
      photoId: photoIdByEntryId.get(moment.entry.id) ?? null,
      stopId: moment.stop?.id ?? null,
      notes: '',
      ...coordinates,
      title: moment.entry.title ?? moment.stop?.title ?? '',
      type: 'moment',
    })
  }

  for (const stop of plannedStops) {
    const coordinates = getValidCoordinates(stop.mapLatitude, stop.mapLongitude)
    if (coordinates === null || usedStopIds.has(stop.id)) {
      continue
    }

    usedStopIds.add(stop.id)
    const checklistItem = checklistByStopId.get(stop.id)
    if (checklistItem !== undefined) {
      const observation = observationByChecklistId.get(checklistItem.id)
      points.push({
        category: checklistItem.category,
        checked: checklistItem.checkedAt !== null,
        checklistItemId: checklistItem.id,
        entryId: checklistItem.entryId,
        id: `nature-goal:${checklistItem.id}`,
        notes: checklistItem.notes,
        photoId: observation?.photoId ?? null,
        stopId: stop.id,
        ...coordinates,
        title: checklistItem.title,
        type: 'nature-goal',
      })
      continue
    }

    points.push({
      category: null,
      checked: false,
      checklistItemId: null,
      entryId: null,
      id: `planned:${stop.id}`,
      photoId: null,
      stopId: stop.id,
      notes: stop.notes,
      ...coordinates,
      title: stop.title,
      type: 'planned',
    })
  }

  return points
}

function getValidCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  return latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
    ? { latitude, longitude }
    : null
}
