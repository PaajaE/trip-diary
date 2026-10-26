import { compareText } from './compare.ts'
import { isKnownTimeZone, localDay } from './local-day.ts'
import { timeZoneAt } from './time-zone.ts'

/**
 * Order and batching of place lookups for stops without a place (plan 4f,
 * point 10). Pure: the app runs the lookups. Stops are bucketed into grid
 * cells (~1 km by default) so one lookup names every stop of a cell; cells
 * of the visible day come first, then the most recent days. Stops that
 * already have a place are not passed in, so a rerun only resolves what is
 * still missing (resumable).
 */

export const DEFAULT_PLACE_CELL_METERS = 1000
export const DEFAULT_PLACE_BATCH_SIZE = 10
const METERS_PER_DEGREE = 111_320

export interface PlaceLookupStop {
  /** Local day (YYYY-MM-DD, 04:00 rule); from `startsAt` and the zone when absent. */
  dayKey?: string | undefined
  id: string
  latitude: number
  longitude: number
  startsAt: string
  /** Zone of the stop; the zone at its position when absent. */
  timeZone?: string | null | undefined
}

export interface PlaceLookupCell {
  /** Day the cell is shown under first (the focus day, else its latest day). */
  dayKey: string
  /** Grid key (also the client cache key). */
  key: string
  /** Position looked up: the oldest stop of the cell (a real stop position). */
  latitude: number
  longitude: number
  /** Stops named by this lookup, oldest first. */
  momentIds: string[]
}

export interface PlaceLookupOptions {
  /** Batch size (cells per batch). */
  batchSize?: number
  /** Edge of a grid cell in metres. */
  cellMeters?: number
  /** Day on screen; its cells come first. */
  focusDayKey?: string | null
}

/** Grid key of a position for cells of `cellMeters` (rows by latitude). */
export function placeCellKey(
  latitude: number,
  longitude: number,
  cellMeters: number = DEFAULT_PLACE_CELL_METERS,
): string {
  const step = cellMeters / METERS_PER_DEGREE
  const row = Math.floor(latitude / step)
  const rowLatitude = (row + 0.5) * step
  const cos = Math.max(0.01, Math.cos((rowLatitude * Math.PI) / 180))
  const col = Math.floor(longitude / (step / cos))
  return `${String(cellMeters)}:${String(row)}:${String(col)}`
}

function dayKeyOf(stop: PlaceLookupStop): string {
  if (stop.dayKey !== undefined) return stop.dayKey
  const time = Date.parse(stop.startsAt)
  if (Number.isNaN(time)) return ''
  let zone = stop.timeZone ?? null
  if (zone === null || !isKnownTimeZone(zone)) {
    try {
      zone = timeZoneAt(stop.latitude, stop.longitude)
    } catch {
      zone = 'UTC'
    }
  }
  try {
    return localDay(time, zone)
  } catch {
    return new Date(time).toISOString().slice(0, 10)
  }
}

/** Plans the lookups: cells in visibility order, split into batches. */
export function planPlaceLookups(
  stops: readonly PlaceLookupStop[],
  options: PlaceLookupOptions = {},
): PlaceLookupCell[][] {
  const cellMeters = options.cellMeters ?? DEFAULT_PLACE_CELL_METERS
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_PLACE_BATCH_SIZE)
  const focus = options.focusDayKey ?? null

  interface Row {
    day: string
    id: string
    stop: PlaceLookupStop
    time: number
  }
  const rows: Row[] = stops
    .filter(
      (stop) =>
        Number.isFinite(stop.latitude) &&
        Number.isFinite(stop.longitude) &&
        Math.abs(stop.latitude) <= 90 &&
        Math.abs(stop.longitude) <= 180,
    )
    .map((stop) => {
      const time = Date.parse(stop.startsAt)
      return {
        day: dayKeyOf(stop),
        id: stop.id,
        stop,
        time: Number.isNaN(time) ? Number.POSITIVE_INFINITY : time,
      }
    })
    .sort((a, b) => a.time - b.time || compareText(a.id, b.id))

  const cells = new Map<string, { first: number; rows: Row[] }>()
  for (const row of rows) {
    const key = placeCellKey(row.stop.latitude, row.stop.longitude, cellMeters)
    const cell = cells.get(key)
    if (cell === undefined) cells.set(key, { first: row.time, rows: [row] })
    else cell.rows.push(row)
  }

  const planned = [...cells.entries()].map(([key, cell]) => {
    const days = cell.rows.map((row) => row.day)
    const onFocus = focus !== null && days.includes(focus)
    const shownOn = focus !== null && onFocus ? focus : null
    const latest = [...days].sort(compareText).pop() ?? ''
    const head = cell.rows[0]
    return {
      cell: {
        dayKey: shownOn ?? latest,
        key,
        latitude: head?.stop.latitude ?? 0,
        longitude: head?.stop.longitude ?? 0,
        momentIds: cell.rows.map((row) => row.id),
      } satisfies PlaceLookupCell,
      first: cell.first,
      onFocus,
    }
  })
  planned.sort(
    (a, b) =>
      Number(b.onFocus) - Number(a.onFocus) ||
      compareText(b.cell.dayKey, a.cell.dayKey) ||
      a.first - b.first ||
      compareText(a.cell.key, b.cell.key),
  )

  const batches: PlaceLookupCell[][] = []
  for (let index = 0; index < planned.length; index += batchSize) {
    batches.push(planned.slice(index, index + batchSize).map((p) => p.cell))
  }
  return batches
}

/**
 * Runs async tasks with at most `limit` in flight; results keep input order.
 * A task that throws yields its error as the result (never unhandled).
 */
export async function runLimited<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
  stopped: () => boolean = () => false,
): Promise<({ ok: true; value: T } | { error: unknown; ok: false } | null)[]> {
  const results: (
    | { ok: true; value: T }
    | { error: unknown; ok: false }
    | null
  )[] = tasks.map(() => null)
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      if (stopped()) return
      const index = next
      next += 1
      const task = tasks[index]
      if (task === undefined) return
      try {
        results[index] = { ok: true, value: await task() }
      } catch (error) {
        results[index] = { error, ok: false }
      }
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, tasks.length)) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}
