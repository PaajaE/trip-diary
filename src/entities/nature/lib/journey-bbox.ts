import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyDetail } from '@/entities/journey/model/journey'

export interface JourneyBbox {
  maxLatitude: number
  maxLongitude: number
  minLatitude: number
  minLongitude: number
}

interface ComputeJourneyBboxInput {
  checklistItems?: JourneyChecklistItem[]
  moments: { location: { latitude: number; longitude: number } | null }[]
  stops?: JourneyDetail['stops']
  templateCenter?: { latitude: number; longitude: number } | null
}

export function computeJourneyBbox(
  input: ComputeJourneyBboxInput,
): JourneyBbox | null {
  const points: { latitude: number; longitude: number }[] = []

  for (const moment of input.moments) {
    if (moment.location !== null) {
      points.push(moment.location)
    }
  }

  for (const stop of input.stops ?? []) {
    if (
      stop.mapLatitude !== null &&
      stop.mapLongitude !== null &&
      Number.isFinite(stop.mapLatitude) &&
      Number.isFinite(stop.mapLongitude)
    ) {
      points.push({
        latitude: stop.mapLatitude,
        longitude: stop.mapLongitude,
      })
    }
  }

  if (
    points.length === 0 &&
    input.templateCenter !== undefined &&
    input.templateCenter !== null
  ) {
    points.push(input.templateCenter)
  }

  if (points.length === 0) {
    return null
  }

  let minLatitude = points[0]?.latitude ?? 0
  let maxLatitude = minLatitude
  let minLongitude = points[0]?.longitude ?? 0
  let maxLongitude = minLongitude

  for (const point of points) {
    minLatitude = Math.min(minLatitude, point.latitude)
    maxLatitude = Math.max(maxLatitude, point.latitude)
    minLongitude = Math.min(minLongitude, point.longitude)
    maxLongitude = Math.max(maxLongitude, point.longitude)
  }

  const pad = points.length === 1 ? 0.08 : 0.04
  return {
    maxLatitude: maxLatitude + pad,
    maxLongitude: maxLongitude + pad,
    minLatitude: minLatitude - pad,
    minLongitude: minLongitude - pad,
  }
}

export function bboxCenter(bbox: JourneyBbox): {
  latitude: number
  longitude: number
} {
  return {
    latitude: (bbox.minLatitude + bbox.maxLatitude) / 2,
    longitude: (bbox.minLongitude + bbox.maxLongitude) / 2,
  }
}

export function bboxCacheKey(bbox: JourneyBbox): string {
  return [
    bbox.minLatitude.toFixed(2),
    bbox.minLongitude.toFixed(2),
    bbox.maxLatitude.toFixed(2),
    bbox.maxLongitude.toFixed(2),
  ].join(':')
}
