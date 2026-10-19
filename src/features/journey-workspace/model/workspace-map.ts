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

/** Pin colours per top-level stage: mid-tone, readable on light and dark maps. */
export const STAGE_PALETTE = [
  '#2f7d5b',
  '#c2571a',
  '#2b6cb0',
  '#a43d8f',
  '#b58a00',
  '#0f8b8d',
  '#c2364a',
  '#6b5bd2',
] as const
/** Moments that belong to no stage. */
export const NEUTRAL_COLOR = '#6b7280'

export const MAX_FIT_ZOOM = 12
export const MOMENT_MIN_ZOOM = 11

export interface MapPin {
  color: string
  id: string
  label: string
  latitude: number
  longitude: number
}

export interface RouteLine {
  color: string
  coordinates: [number, number][]
}

export type MapView =
  | { bounds: [[number, number], [number, number]]; type: 'bounds' }
  | { center: [number, number]; minZoom: number; type: 'point' }

export function stageColor(rootIndex: number): string {
  return STAGE_PALETTE[rootIndex % STAGE_PALETTE.length] ?? NEUTRAL_COLOR
}

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

/**
 * Route through the pins in the given (time) order, one line per run of the
 * same colour. A run starts at the last pin of the previous one so the route
 * stays unbroken.
 */
export function buildRoutes(pins: readonly MapPin[]): RouteLine[] {
  const out: RouteLine[] = []
  let previous: [number, number] | null = null
  for (const pin of pins) {
    const here: [number, number] = [pin.longitude, pin.latitude]
    const last = out[out.length - 1]
    if (last?.color === pin.color) {
      last.coordinates.push(here)
    } else {
      out.push({
        color: pin.color,
        coordinates: previous === null ? [here] : [previous, here],
      })
    }
    previous = here
  }
  return out.filter((line) => line.coordinates.length > 1)
}

export interface WorkspaceMapModel {
  /** Segment ids that must be open to show a moment (outermost first). */
  expandFor: ReadonlyMap<string, string[]>
  /** Pins in time order. */
  pins: MapPin[]
  /** Moment ids by outline element id (segment, day or moment). */
  scopes: ReadonlyMap<string, string[]>
}

/** Pins, colours and outline-scope index of the workspace tree. */
export function buildMapModel(
  tree: WorkspaceTree,
  labelOf: (entry: WorkspaceMoment) => string,
): WorkspaceMapModel {
  const scopes = new Map<string, string[]>()
  const expandFor = new Map<string, string[]>()
  const colorOf = new Map<string, string>()
  const entries = new Map<string, WorkspaceMoment>()

  const addDays = (scope: string, moments: WorkspaceMoment[]) => {
    for (const day of groupMomentsByDay(moments))
      scopes.set(
        dayElementId(scope, day.key),
        day.moments.map((m) => m.moment.id),
      )
  }
  const walk = (
    node: WorkspaceSegment,
    path: string[],
    color: string,
  ): string[] => {
    const here = [...path, node.segment.id]
    const ids: string[] = []
    for (const entry of node.moments) {
      ids.push(entry.moment.id)
      entries.set(entry.moment.id, entry)
      colorOf.set(entry.moment.id, color)
      expandFor.set(entry.moment.id, here)
      scopes.set(momentElementId(entry.moment.id), [entry.moment.id])
    }
    addDays(node.segment.id, node.moments)
    for (const child of node.children) ids.push(...walk(child, here, color))
    scopes.set(segmentElementId(node.segment.id), ids)
    return ids
  }
  tree.roots.forEach((root, index) => {
    walk(root, [], stageColor(index))
  })
  for (const entry of tree.looseMoments) {
    entries.set(entry.moment.id, entry)
    colorOf.set(entry.moment.id, NEUTRAL_COLOR)
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
  const pins: MapPin[] = []
  for (const entry of ordered) {
    const { latitude, longitude, id } = entry.moment
    if (latitude === null || longitude === null) continue
    pins.push({
      color: colorOf.get(id) ?? NEUTRAL_COLOR,
      id,
      label: labelOf(entry),
      latitude,
      longitude,
    })
  }
  return { expandFor, pins, scopes }
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
