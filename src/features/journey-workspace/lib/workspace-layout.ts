// Pure layout rules of the workspace overview (rail, map panel) and their
// per-browser storage. No React here so the maths can be tested on its own.

export type RailState = 'open' | 'collapsed'
export type MapMode = 'panel' | 'hidden'

export interface StoredLayout {
  map: MapMode
  mapW: number
  rail: RailState
}

export const MAP_W_DEFAULT = 340
export const MAP_W_MIN = 280
/** Narrowest the day cards column may get while the map is a panel. */
export const CONTENT_MIN = 360
export const SPLITTER_W = 14
/** Rail column widths at 1100px and wider. */
export const RAIL_W_OPEN = 220
export const RAIL_W_COLLAPSED = 60
const SNAP_DISTANCE = 14

export const DEFAULT_LAYOUT: StoredLayout = {
  map: 'panel',
  mapW: MAP_W_DEFAULT,
  rail: 'open',
}

export interface WidthBounds {
  max: number
  min: number
}

/** Map width limits for a row of `rowWidth` px whose rail takes `railWidth`. */
export function mapWidthBounds(
  rowWidth: number,
  railWidth: number,
): WidthBounds {
  const max = Math.min(
    rowWidth * 0.6,
    rowWidth - railWidth - SPLITTER_W - CONTENT_MIN,
  )
  return { max: Math.max(MAP_W_MIN, max), min: MAP_W_MIN }
}

/**
 * Clamps a requested map width; with `snap` it also sticks to one third and one
 * half of the row when it is within a few pixels of them.
 */
export function clampMapWidth(
  width: number,
  rowWidth: number,
  railWidth: number,
  snap: boolean,
): number {
  const { max, min } = mapWidthBounds(rowWidth, railWidth)
  let next = Math.max(min, Math.min(max, width))
  if (snap) {
    for (const target of [rowWidth / 3, rowWidth / 2]) {
      if (Math.abs(next - target) < SNAP_DISTANCE) next = target
    }
  }
  return Math.round(Math.max(min, Math.min(max, next)))
}

export const LAYOUT_STORAGE_KEY = 'trip-diary.workspace-layout'

export function readStoredLayout(): StoredLayout {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (raw === null) return DEFAULT_LAYOUT
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return DEFAULT_LAYOUT
    const record = data as Record<string, unknown>
    const mapW = record.mapW
    return {
      map: record.map === 'hidden' ? 'hidden' : 'panel',
      mapW:
        typeof mapW === 'number' && Number.isFinite(mapW) && mapW >= MAP_W_MIN
          ? Math.round(mapW)
          : MAP_W_DEFAULT,
      rail: record.rail === 'collapsed' ? 'collapsed' : 'open',
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function storeLayout(layout: StoredLayout) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Storage can be unavailable (private mode); the layout then lasts one visit.
  }
}

/** Shortcuts must not fire while the user types or holds a modifier. */
export function isShortcutBlocked(event: KeyboardEvent): boolean {
  // AltGr (how "[" is typed on Czech keyboards) reports ctrl+alt; allow it.
  const altGr = event.getModifierState('AltGraph')
  if (event.metaKey || (!altGr && (event.ctrlKey || event.altKey))) return true
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}
