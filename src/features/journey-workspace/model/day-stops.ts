import {
  centroid,
  distanceKm,
  type GeoPoint,
} from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'

/** Consecutive moments at the same place closer than this form one stop. */
export const STOP_MERGE_GAP_MS = 2 * 60 * 60 * 1000

export interface DayStop {
  /** Centroid of the stop's coordinates, null when none is known. */
  centre: GeoPoint | null
  endsAt: string
  /** Photo/video to show large: first starred photo, else first photo. */
  hero: MediaItem | null
  /** Stable id: the id of the first moment. */
  id: string
  /** Straight-line km to the next stop, null when either side has no position. */
  kmToNext: number | null
  media: MediaItem[]
  moments: WorkspaceMoment[]
  /** Place name shared by the stop's moments, null when unknown. */
  placeLabel: string | null
  photoCount: number
  startsAt: string
  /** Zone of the first moment, for display. */
  tz: string | null
  /** Moment title, else the place name, null when neither exists. */
  title: string | null
  videoCount: number
}

function time(iso: string): number {
  return Date.parse(iso)
}

function momentPoints(entry: WorkspaceMoment): GeoPoint[] {
  const { latitude, longitude } = entry.moment
  if (latitude !== null && longitude !== null) return [{ latitude, longitude }]
  return entry.media.flatMap((item) =>
    item.latitude !== null && item.longitude !== null && !item.hideLocation
      ? [{ latitude: item.latitude, longitude: item.longitude }]
      : [],
  )
}

function byCapture(a: MediaItem, b: MediaItem): number {
  const ta = a.capturedAt === null ? Infinity : time(a.capturedAt)
  const tb = b.capturedAt === null ? Infinity : time(b.capturedAt)
  return ta - tb || a.id.localeCompare(b.id)
}

function pickHero(media: readonly MediaItem[]): MediaItem | null {
  const photos = media.filter((item) => item.kind === 'photo')
  return photos.find((item) => item.starred) ?? photos[0] ?? media[0] ?? null
}

function build(
  group: WorkspaceMoment[],
  label: string | null,
): Omit<DayStop, 'kmToNext'> {
  const first = group[0]
  if (first === undefined) throw new Error('empty stop group')
  const media = group.flatMap((entry) => entry.media).sort(byCapture)
  const title = group.find((entry) => entry.moment.title !== null)?.moment.title
  let endsAt = first.moment.endsAt
  for (const entry of group) {
    if (time(entry.moment.endsAt) > time(endsAt)) endsAt = entry.moment.endsAt
  }
  return {
    centre: centroid(group.flatMap(momentPoints)),
    endsAt,
    hero: pickHero(media),
    id: first.moment.id,
    media,
    moments: group,
    photoCount: group.reduce((sum, entry) => sum + entry.photoCount, 0),
    placeLabel: label,
    startsAt: first.moment.startsAt,
    title: title ?? label,
    tz: first.tz,
    videoCount: group.reduce((sum, entry) => sum + entry.videoCount, 0),
  }
}

/**
 * Groups the moments of one day into stops: consecutive moments with the same
 * place label (case-insensitive) whose gap is at most 2 hours. Moments with no
 * place label never merge. `labelOf` returns the place name of a moment.
 */
export function buildDayStops(
  moments: readonly WorkspaceMoment[],
  labelOf: (entry: WorkspaceMoment) => string | null,
): DayStop[] {
  const sorted = [...moments].sort(
    (a, b) =>
      time(a.moment.startsAt) - time(b.moment.startsAt) ||
      a.moment.id.localeCompare(b.moment.id),
  )
  const groups: { items: WorkspaceMoment[]; label: string | null }[] = []
  let endMs = -Infinity
  for (const entry of sorted) {
    const raw = labelOf(entry)?.trim() ?? ''
    const label = raw === '' ? null : raw
    const last = groups[groups.length - 1]
    const merge =
      last !== undefined &&
      label !== null &&
      last.label !== null &&
      label.toLocaleLowerCase() === last.label.toLocaleLowerCase() &&
      time(entry.moment.startsAt) - endMs <= STOP_MERGE_GAP_MS
    if (merge) last.items.push(entry)
    else groups.push({ items: [entry], label })
    endMs = merge
      ? Math.max(endMs, time(entry.moment.endsAt))
      : time(entry.moment.endsAt)
  }
  const stops = groups.map((group) => build(group.items, group.label))
  return stops.map((stop, index) => {
    const next = stops[index + 1]
    return {
      ...stop,
      kmToNext:
        stop.centre !== null && next !== undefined && next.centre !== null
          ? distanceKm(stop.centre, next.centre)
          : null,
    }
  })
}
