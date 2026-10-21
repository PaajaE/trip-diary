import { getThumbUrl } from '@/features/journey-workspace/lib/media-thumb'
import {
  momentElementId,
  segmentElementId,
} from '@/features/journey-workspace/lib/outline-ids'
import {
  dayElementId,
  groupMomentsByDay,
  LOOSE_SCOPE,
} from '@/features/journey-workspace/model/workspace-days'
import type {
  WorkspaceMoment,
  WorkspaceSegment,
  WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

export const MAX_FIT_ZOOM = 13
export const MOMENT_MIN_ZOOM = 11

export interface MapPin {
  id: string
  label: string
  latitude: number
  longitude: number
}

export type MapView =
  | { bounds: [[number, number], [number, number]]; type: 'bounds' }
  | { center: [number, number]; minZoom: number; type: 'point' }

/** South-west / north-east corner of the coordinates, null when empty. */
export function boundsOf(
  coords: readonly (readonly [number, number])[],
): [[number, number], [number, number]] | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lng, lat] of coords) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  if (west === Infinity) return null
  return [
    [west, south],
    [east, north],
  ]
}

/**
 * Map view for a set of moment ids (null = all pins). One pin (or several at
 * the same spot) gives a point view, more a bounds fit, none gives null.
 */
export function computeView(
  pins: readonly MapPin[],
  ids: readonly string[] | null,
): MapView | null {
  const wanted = ids === null ? null : new Set(ids)
  const coords: [number, number][] = []
  for (const pin of pins) {
    if (wanted !== null && !wanted.has(pin.id)) continue
    coords.push([pin.longitude, pin.latitude])
  }
  const bounds = boundsOf(coords)
  if (bounds === null) return null
  const [[west, south], [east, north]] = bounds
  if (west === east && south === north)
    return {
      center: [west, south],
      minZoom: MOMENT_MIN_ZOOM,
      type: 'point',
    }
  return { bounds, type: 'bounds' }
}

export interface DayFocus {
  /** Dashed line through the day's points in time order; null under 2 points. */
  line: [number, number][] | null
  /** 1-based number of every in-focus pin (time order within the day). */
  numbers: ReadonlyMap<string, number>
}

export const NO_FOCUS: DayFocus = { line: null, numbers: new Map() }

/**
 * Numbers and line of the focused day. Only pins of the day are numbered or
 * connected; `dayPinIds` null (nothing focused) gives neither.
 */
export function computeFocus(
  pins: readonly MapPin[],
  dayPinIds: readonly string[] | null,
): DayFocus {
  if (dayPinIds === null) return NO_FOCUS
  const wanted = new Set(dayPinIds)
  const numbers = new Map<string, number>()
  const line: [number, number][] = []
  for (const pin of pins) {
    if (!wanted.has(pin.id)) continue
    numbers.set(pin.id, numbers.size + 1)
    line.push([pin.longitude, pin.latitude])
  }
  return { line: line.length > 1 ? line : null, numbers }
}

/** Compact day caption: "St 3. 6." (cs) / "Wed 3 Jun" (other locales). */
export function formatDayCaption(
  dayKey: string,
  locale: string,
): string | null {
  const time = Date.parse(`${dayKey}T12:00:00Z`)
  if (Number.isNaN(time)) return null
  const cs = locale.startsWith('cs')
  const parts = new Intl.DateTimeFormat(cs ? 'cs' : 'en-GB', {
    day: 'numeric',
    month: cs ? 'numeric' : 'short',
    timeZone: 'UTC',
    weekday: 'short',
  }).formatToParts(time)
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekday = pick('weekday').replace(/\.$/, '')
  const head = weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1)
  return cs
    ? `${head} ${pick('day')}. ${pick('month')}.`
    : `${head} ${pick('day')} ${pick('month')}`
}

export interface MapDay {
  /** Local day key ("2026-06-03") or UNKNOWN_DAY. */
  key: string
  /** Moment ids of the day. */
  momentIds: string[]
}

export interface WorkspaceMapModel {
  /** Segment ids that must be open to show a moment (outermost first). */
  expandFor: ReadonlyMap<string, string[]>
  /** Calendar days by outline day element id. */
  days: ReadonlyMap<string, MapDay>
  /** Day element id of every moment. */
  dayOfMoment: ReadonlyMap<string, string>
  /** Day element id that an outline element (day, moment, stage) stands for. */
  dayOfElement: ReadonlyMap<string, string>
  /** Pins in time order. */
  pins: MapPin[]
  /** Moment ids by outline element id (segment, day or moment). */
  scopes: ReadonlyMap<string, string[]>
}

/** Pins, days and outline-scope index of the workspace tree. */
export function buildMapModel(
  tree: WorkspaceTree,
  labelOf: (entry: WorkspaceMoment) => string,
): WorkspaceMapModel {
  const scopes = new Map<string, string[]>()
  const expandFor = new Map<string, string[]>()
  const days = new Map<string, MapDay>()
  const dayOfMoment = new Map<string, string>()
  const dayOfElement = new Map<string, string>()
  const entries = new Map<string, WorkspaceMoment>()

  const addDays = (scope: string, moments: WorkspaceMoment[]) => {
    for (const day of groupMomentsByDay(moments)) {
      const id = dayElementId(scope, day.key)
      const momentIds = day.moments.map((m) => m.moment.id)
      scopes.set(id, momentIds)
      days.set(id, { key: day.key, momentIds })
      dayOfElement.set(id, id)
      for (const momentId of momentIds) {
        dayOfMoment.set(momentId, id)
        dayOfElement.set(momentElementId(momentId), id)
      }
    }
  }
  const walk = (node: WorkspaceSegment, path: string[]): string[] => {
    const here = [...path, node.segment.id]
    const ids: string[] = []
    for (const entry of node.moments) {
      ids.push(entry.moment.id)
      entries.set(entry.moment.id, entry)
      expandFor.set(entry.moment.id, here)
      scopes.set(momentElementId(entry.moment.id), [entry.moment.id])
    }
    addDays(node.segment.id, node.moments)
    for (const child of node.children) ids.push(...walk(child, here))
    scopes.set(segmentElementId(node.segment.id), ids)
    return ids
  }
  for (const root of tree.roots) walk(root, [])
  for (const entry of tree.looseMoments) {
    entries.set(entry.moment.id, entry)
    expandFor.set(entry.moment.id, [])
    scopes.set(momentElementId(entry.moment.id), [entry.moment.id])
  }
  addDays(LOOSE_SCOPE, tree.looseMoments)

  const time = (entry: WorkspaceMoment) => {
    const value = Date.parse(entry.moment.startsAt)
    return Number.isNaN(value) ? Infinity : value
  }
  const ordered = [...entries.values()].sort(
    (a, b) => time(a) - time(b) || a.moment.id.localeCompare(b.moment.id),
  )
  const rank = new Map(ordered.map((entry, i) => [entry.moment.id, i]))
  // A stage stands for its earliest day while the scroll is on its header.
  const visitSegment = (node: WorkspaceSegment) => {
    let best: string | null = null
    for (const id of scopes.get(segmentElementId(node.segment.id)) ?? []) {
      if (best === null || (rank.get(id) ?? 0) < (rank.get(best) ?? 0))
        best = id
    }
    const day = best === null ? undefined : dayOfMoment.get(best)
    if (day !== undefined)
      dayOfElement.set(segmentElementId(node.segment.id), day)
    node.children.forEach(visitSegment)
  }
  tree.roots.forEach(visitSegment)

  const pins: MapPin[] = []
  for (const entry of ordered) {
    const { latitude, longitude, id } = entry.moment
    if (latitude === null || longitude === null) continue
    pins.push({ id, label: labelOf(entry), latitude, longitude })
  }
  for (const day of days.values()) {
    day.momentIds.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
  }
  return { dayOfElement, dayOfMoment, days, expandFor, pins, scopes }
}

/** Estimated rendered height (px) of a moment block, for lazy placeholders. */
export function estimateMomentHeight(
  mediaCount: number,
  hasBody: boolean,
  gridLimit = 6,
): number {
  const tiles = Math.min(mediaCount, gridLimit)
  const rows = Math.ceil(tiles / 3)
  return 88 + (hasBody ? 56 : 0) + (rows > 0 ? 8 + rows * 120 : 0)
}

/** Tiny pub/sub for the hovered moment, so hovering never re-renders the tree. */
export interface HoverStore {
  get: () => string | null
  set: (id: string | null) => void
  subscribe: (listener: (id: string | null) => void) => () => void
}

export function createHoverStore(): HoverStore {
  let current: string | null = null
  const listeners = new Set<(id: string | null) => void>()
  return {
    get: () => current,
    set: (id) => {
      if (id === current) return
      current = id
      listeners.forEach((listener) => {
        listener(id)
      })
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Zoom below which the overview (stage bubbles) is shown. */
export const OVERVIEW_ZOOM = 8
/** Zoom from which out-of-focus moments may get small thumbnails. */
export const DETAIL_ZOOM = 11
/** More viewport candidates than this and no thumbnails are drawn. */
export const MAX_THUMB_CANDIDATES = 40
/** Minimum screen distance (px) between the centers of two bubbles. */
export const MIN_BUBBLE_DISTANCE = 34

export interface MomentBubble {
  photoCount: number
  starred: boolean
  url: string
}

export interface StageBubble {
  id: string
  latitude: number
  longitude: number
  title: string
  url: string
}

export interface BubbleModel {
  /** Moments whose cover has a usable image, by moment id. */
  moments: ReadonlyMap<string, MomentBubble>
  /** One bubble per top-level stage with a cover and coordinates. */
  stages: StageBubble[]
}

export const NO_BUBBLES: BubbleModel = { moments: new Map(), stages: [] }

/** Mean of the finite coordinates; null when there are none. */
export function meanPosition(
  coords: readonly (readonly [number, number])[],
): [number, number] | null {
  if (coords.length === 0) return null
  let lng = 0
  let lat = 0
  for (const [x, y] of coords) {
    lng += x
    lat += y
  }
  return [lng / coords.length, lat / coords.length]
}

/** Cover thumbnails of moments and stage bubble positions. */
export function buildBubbleModel(
  tree: WorkspaceTree,
  baseUrl: string,
): BubbleModel {
  const moments = new Map<string, MomentBubble>()
  const add = (entry: WorkspaceMoment) => {
    const url = entry.cover === null ? null : getThumbUrl(entry.cover, baseUrl)
    if (url === null) return
    moments.set(entry.moment.id, {
      photoCount: entry.photoCount,
      starred: entry.cover?.starred === true,
      url,
    })
  }
  const stages: StageBubble[] = []
  const coordsOf = (node: WorkspaceSegment): [number, number][] => {
    const coords: [number, number][] = []
    for (const entry of node.moments) {
      add(entry)
      const { latitude, longitude } = entry.moment
      if (latitude !== null && longitude !== null)
        coords.push([longitude, latitude])
    }
    for (const child of node.children) coords.push(...coordsOf(child))
    return coords
  }
  for (const root of tree.roots) {
    const mean = meanPosition(coordsOf(root))
    const url = root.cover === null ? null : getThumbUrl(root.cover, baseUrl)
    if (mean === null || url === null) continue
    stages.push({
      id: root.segment.id,
      latitude: mean[1],
      longitude: mean[0],
      title: root.segment.title,
      url,
    })
  }
  for (const entry of tree.looseMoments) add(entry)
  return { moments, stages }
}

export interface ViewportBounds {
  east: number
  north: number
  south: number
  west: number
}

/** Pins inside the viewport that have a thumbnail and are not skipped. */
export function viewportCandidates(
  pins: readonly MapPin[],
  bounds: ViewportBounds,
  skip: ReadonlyMap<string, unknown>,
  bubbles: ReadonlyMap<string, MomentBubble>,
): MapPin[] {
  return pins.filter(
    (pin) =>
      !skip.has(pin.id) &&
      bubbles.has(pin.id) &&
      pin.latitude >= bounds.south &&
      pin.latitude <= bounds.north &&
      (bounds.west <= bounds.east
        ? pin.longitude >= bounds.west && pin.longitude <= bounds.east
        : pin.longitude >= bounds.west || pin.longitude <= bounds.east),
  )
}

export interface ScreenPoint {
  x: number
  y: number
}

export interface PlaceCandidate extends ScreenPoint {
  id: string
  photoCount: number
  starred: boolean
}

/**
 * Greedy collision avoidance: candidates by priority (starred cover, then
 * photo count, then id), each kept only if its center is at least
 * `minDistance` from every already placed bubble. `occupied` (focused-day
 * bubbles) is placed first and always wins.
 */
export function placeBubbles(
  occupied: readonly ScreenPoint[],
  candidates: readonly PlaceCandidate[],
  minDistance = MIN_BUBBLE_DISTANCE,
): string[] {
  const placed: ScreenPoint[] = [...occupied]
  const kept: string[] = []
  const sorted = [...candidates].sort(
    (a, b) =>
      Number(b.starred) - Number(a.starred) ||
      b.photoCount - a.photoCount ||
      a.id.localeCompare(b.id),
  )
  for (const c of sorted) {
    const clear = placed.every(
      (p) => Math.hypot(p.x - c.x, p.y - c.y) >= minDistance,
    )
    if (!clear) continue
    placed.push(c)
    kept.push(c.id)
  }
  return kept
}
