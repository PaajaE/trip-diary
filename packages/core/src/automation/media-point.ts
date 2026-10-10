import type { GeoPoint } from './geo.ts'

/** Minimal media shape the automation works with. */
export interface MediaPoint {
  /** Exact capture instant (ISO 8601 with offset) or null when unknown. */
  capturedAt: string | null
  id: string
  latitude: number | null
  longitude: number | null
}

export interface DatedMediaPoint extends MediaPoint {
  capturedAt: string
  /** Parsed capture instant in epoch milliseconds. */
  time: number
}

export function pointOf(media: MediaPoint): GeoPoint | null {
  return media.latitude === null || media.longitude === null
    ? null
    : { latitude: media.latitude, longitude: media.longitude }
}

/**
 * Keeps media with a valid capture time, sorted by time then id so results do
 * not depend on input order.
 */
export function sortDated(media: readonly MediaPoint[]): {
  dated: DatedMediaPoint[]
  undated: MediaPoint[]
} {
  const dated: DatedMediaPoint[] = []
  const undated: MediaPoint[] = []
  for (const item of media) {
    const time =
      item.capturedAt === null ? Number.NaN : Date.parse(item.capturedAt)
    if (item.capturedAt === null || Number.isNaN(time)) {
      undated.push(item)
    } else {
      dated.push({ ...item, capturedAt: item.capturedAt, time })
    }
  }
  dated.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  return { dated, undated }
}
