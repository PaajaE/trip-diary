import { distanceKm, type GeoPoint } from './geo.ts'
import { pointOf, sortDated, type MediaPoint } from './media-point.ts'

export interface TrackPoint extends GeoPoint {
  elevation?: number
}

export interface TrackSummary {
  /** Total climb in metres, when elevations are known. */
  ascentM: number | null
  distanceM: number
  /** GeoJSON LineString with [longitude, latitude(, elevation)] positions. */
  geojson: { coordinates: number[][]; type: 'LineString' }
}

/** Perpendicular distance from `point` to segment a-b in metres (local plane). */
function offsetMetres(point: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const metresPerDegLat = 111_320
  const metresPerDegLng = 111_320 * Math.cos((a.latitude * Math.PI) / 180)
  const ax = 0
  const ay = 0
  const bx = (b.longitude - a.longitude) * metresPerDegLng
  const by = (b.latitude - a.latitude) * metresPerDegLat
  const px = (point.longitude - a.longitude) * metresPerDegLng
  const py = (point.latitude - a.latitude) * metresPerDegLat
  const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2
  if (lengthSq === 0) {
    return Math.hypot(px, py)
  }
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq))
  return Math.hypot(px - t * bx, py - t * by)
}

/** Douglas–Peucker simplification; keeps first and last point. */
export function simplifyTrack<T extends GeoPoint>(
  points: readonly T[],
  toleranceM: number,
): T[] {
  if (points.length <= 2) {
    return [...points]
  }
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const range = stack.pop()
    if (range === undefined) {
      break
    }
    const [start, end] = range
    const a = points[start]
    const b = points[end]
    if (a === undefined || b === undefined) {
      continue
    }
    let maxOffset = 0
    let maxIndex = -1
    for (let index = start + 1; index < end; index += 1) {
      const point = points[index]
      if (point === undefined) {
        continue
      }
      const offset = offsetMetres(point, a, b)
      if (offset > maxOffset) {
        maxOffset = offset
        maxIndex = index
      }
    }
    if (maxIndex !== -1 && maxOffset > toleranceM) {
      keep[maxIndex] = true
      stack.push([start, maxIndex], [maxIndex, end])
    }
  }
  return points.filter((_, index) => keep[index])
}

/** Distance and climb measured on the full, unsimplified track. */
export function summarizeTrack(
  points: readonly TrackPoint[],
  options: { simplifyToleranceM?: number } = {},
): TrackSummary | null {
  if (points.length < 2) {
    return null
  }
  let distanceM = 0
  let ascentM = 0
  let hasElevation = true
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous === undefined || current === undefined) {
      continue
    }
    distanceM += distanceKm(previous, current) * 1000
    if (previous.elevation === undefined || current.elevation === undefined) {
      hasElevation = false
    } else if (current.elevation > previous.elevation) {
      ascentM += current.elevation - previous.elevation
    }
  }
  const simplified = simplifyTrack(points, options.simplifyToleranceM ?? 25)
  return {
    ascentM: hasElevation ? Math.round(ascentM) : null,
    distanceM: Math.round(distanceM),
    geojson: {
      coordinates: simplified.map((point) =>
        point.elevation === undefined
          ? [point.longitude, point.latitude]
          : [point.longitude, point.latitude, point.elevation],
      ),
      type: 'LineString',
    },
  }
}

/**
 * Approximate route from the photos of a segment, in capture order. A coarse
 * fallback when no GPX is available; photos are sparse, so no climb is given.
 */
export function deriveTrackFromMedia(
  media: readonly MediaPoint[],
): TrackSummary | null {
  const points = sortDated(media)
    .dated.map(pointOf)
    .filter((point): point is GeoPoint => point !== null)
  const summary = summarizeTrack(points, { simplifyToleranceM: 50 })
  return summary === null ? null : { ...summary, ascentM: null }
}

const TRKPT = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g
const ATTR = (name: string) => new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`)
const ELE = /<ele>\s*([-+0-9.eE]+)\s*<\/ele>/

/**
 * Reads track points from a GPX document (all <trkpt> elements in order).
 * Dependency-free so it runs in the browser, the app and edge functions.
 */
export function parseGpxTrackPoints(gpx: string): TrackPoint[] {
  const points: TrackPoint[] = []
  for (const match of gpx.matchAll(TRKPT)) {
    const attributes = match[1] ?? match[3] ?? ''
    const latitude = Number(ATTR('lat').exec(attributes)?.[1])
    const longitude = Number(ATTR('lon').exec(attributes)?.[1])
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      continue
    }
    const elevation = Number(ELE.exec(match[2] ?? '')?.[1])
    points.push(
      Number.isFinite(elevation)
        ? { elevation, latitude, longitude }
        : { latitude, longitude },
    )
  }
  return points
}
