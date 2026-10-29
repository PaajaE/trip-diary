/**
 * Pure model of the quick-sort session ("Rychlé třídění"): the stable session
 * list, the action stack behind Undo, navigation over still-open items, series
 * membership and the end-of-session summary. No React, no I/O.
 */
import { clusterSeries } from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  groupBatchByDay,
  UNKNOWN_DAY,
} from '@/features/media-batch/model/batch-days'

export type SortActionType =
  | 'trash'
  | 'moveTo'
  | 'newStop'
  | 'done'
  /** "★ Nejlepší" of the day sorting: kept (sorted) and starred in one step. */
  | 'best'
  | 'star'
  | 'unstar'

export type SortOutcome = 'trash' | 'stop' | 'done'

export interface SortAction {
  /** Unique within the session; identifies the action while it is in flight. */
  seq: number
  type: SortActionType
  ids: readonly string[]
  /** moveTo: the target stop. */
  momentId?: string
  /** newStop: the stop the step created (known once the request is done). */
  createdMomentId?: string | null
  /** Still being saved: Undo waits for it. */
  pending?: boolean
  /** best: the step turned ★ on (Undo turns it off again). */
  starred?: boolean
}

export type SortHistory = readonly SortAction[]

export interface SessionDay {
  key: string
  ids: string[]
}

export interface QuickSortSession {
  /** Item ids in reading order (day, then captured time). */
  ids: string[]
  /** The items as they were at the start (the list does not jump later). */
  byId: ReadonlyMap<string, MediaItem>
  dayOf: ReadonlyMap<string, string>
  days: SessionDay[]
  /** Groups of >= 2 similar photos; only items with a phash take part. */
  series: string[][]
  seriesOf: ReadonlyMap<string, readonly string[]>
}

export function buildSession(items: readonly MediaItem[]): QuickSortSession {
  const days = groupBatchByDay(items)
  const ids: string[] = []
  const byId = new Map<string, MediaItem>()
  const dayOf = new Map<string, string>()
  for (const day of days) {
    for (const item of day.items) {
      ids.push(item.id)
      byId.set(item.id, item)
      dayOf.set(item.id, day.key)
    }
  }
  const series = clusterSeries(
    ids.flatMap((id) => {
      const item = byId.get(id)
      return item === undefined
        ? []
        : [
            {
              capturedAt: item.capturedAt,
              id,
              phash: item.phash ?? null,
            },
          ]
    }),
  )
  const seriesOf = new Map<string, readonly string[]>()
  for (const group of series) {
    for (const id of group) seriesOf.set(id, group)
  }
  return {
    byId,
    dayOf,
    days: days.map((day) => ({
      ids: day.items.map((item) => item.id),
      key: day.key,
    })),
    ids,
    series,
    seriesOf,
  }
}

export function outcomeOf(type: SortActionType): SortOutcome | null {
  switch (type) {
    case 'trash':
      return 'trash'
    case 'moveTo':
    case 'newStop':
      return 'stop'
    case 'done':
    case 'best':
      return 'done'
    case 'star':
    case 'unstar':
      return null
  }
}

/** What the session did to each item that left the unsorted list. */
export function handledMap(history: SortHistory): Map<string, SortOutcome> {
  const map = new Map<string, SortOutcome>()
  for (const action of history) {
    const outcome = outcomeOf(action.type)
    if (outcome === null) continue
    for (const id of action.ids) map.set(id, outcome)
  }
  return map
}

function findOpen(
  ids: readonly string[],
  handled: ReadonlyMap<string, SortOutcome>,
  from: number,
  delta: 1 | -1,
): number | null {
  for (let i = from + delta; i >= 0 && i < ids.length; i += delta) {
    const id = ids[i]
    if (id !== undefined && !handled.has(id)) return i
  }
  return null
}

/** Next/previous index that is still open, or null at the edge. */
export function stepOpen(
  ids: readonly string[],
  handled: ReadonlyMap<string, SortOutcome>,
  from: number,
  delta: 1 | -1,
): number | null {
  return findOpen(ids, handled, from, delta)
}

/** After acting on `from`: the next open item, else the previous one, else null. */
export function advanceOpen(
  ids: readonly string[],
  handled: ReadonlyMap<string, SortOutcome>,
  from: number,
): number | null {
  return findOpen(ids, handled, from, 1) ?? findOpen(ids, handled, from, -1)
}

/** Skip: the next open item, wrapping to the first open one; null if none else. */
export function skipTarget(
  ids: readonly string[],
  handled: ReadonlyMap<string, SortOutcome>,
  from: number,
): number | null {
  const next = findOpen(ids, handled, from, 1)
  if (next !== null) return next
  const first = findOpen(ids, handled, -1, 1)
  return first !== null && first !== from ? first : null
}

export function countOpen(
  ids: readonly string[],
  handled: ReadonlyMap<string, SortOutcome>,
): number {
  return ids.filter((id) => !handled.has(id)).length
}

export function pushAction(
  history: SortHistory,
  action: SortAction,
): SortHistory {
  return [...history, action]
}

export function dropAction(history: SortHistory, seq: number): SortHistory {
  return history.filter((action) => action.seq !== seq)
}

/** Patches an action once its request is done (clears `pending`). */
export function settleAction(
  history: SortHistory,
  seq: number,
  patch: Partial<Pick<SortAction, 'createdMomentId'>> = {},
): SortHistory {
  return history.map((action) => {
    if (action.seq !== seq) return action
    const next: SortAction = { ...action, ...patch }
    delete next.pending
    return next
  })
}

/** Top of the stack; null when empty or still saving (Undo must wait). */
export function undoable(history: SortHistory): SortAction | null {
  const top = history[history.length - 1]
  return top === undefined || top.pending === true ? null : top
}

export function popAction(history: SortHistory): SortHistory {
  return history.slice(0, -1)
}

/** Items of the series that are still open, in session order. */
export function openSeries(
  session: QuickSortSession,
  id: string,
  handled: ReadonlyMap<string, SortOutcome>,
): string[] {
  const group = session.seriesOf.get(id)
  return group === undefined ? [] : group.filter((m) => !handled.has(m))
}

/** Neighbours taken from the day when a photo has no series. */
const COMPARE_NEIGHBOURS = 6

/**
 * Photos the compare view may pair with `id`: its series, else the nearest
 * neighbours of the same day; never itself and never a trashed photo.
 */
export function comparePool(
  session: QuickSortSession,
  id: string,
  handled: ReadonlyMap<string, SortOutcome>,
): string[] {
  const usable = (own: string) => own !== id && handled.get(own) !== 'trash'
  const group = session.seriesOf.get(id)
  if (group !== undefined && group.length >= 2) return group.filter(usable)
  const day = session.days.find((entry) => entry.key === session.dayOf.get(id))
  const at = day === undefined ? -1 : day.ids.indexOf(id)
  if (day === undefined || at === -1) return []
  return day.ids
    .slice(Math.max(0, at - COMPARE_NEIGHBOURS), at + COMPARE_NEIGHBOURS + 1)
    .filter(usable)
}

export interface QuickSortSummary {
  starred: number
  trashed: number
  toStops: number
  done: number
}

/** What the session did and still stands (undone steps are off the stack). */
export function summarize(history: SortHistory): QuickSortSummary {
  const handled = handledMap(history)
  const starred = new Set<string>()
  for (const action of history) {
    for (const id of action.ids) {
      if (action.type === 'star' || action.type === 'best') starred.add(id)
      if (action.type === 'unstar') starred.delete(id)
    }
  }
  let trashed = 0
  let toStops = 0
  let done = 0
  for (const [id, outcome] of handled) {
    if (outcome === 'trash') {
      trashed++
      starred.delete(id)
    } else if (outcome === 'stop') toStops++
    else done++
  }
  return { done, starred: starred.size, toStops, trashed }
}

/** Last item the session sorted, newest step first. */
export function lastSortedId(history: SortHistory): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const action = history[i]
    if (action === undefined || outcomeOf(action.type) === null) continue
    const id = action.ids[action.ids.length - 1]
    if (id !== undefined) return id
  }
  return null
}

/** Local day key to open the day route for; null when it has no calendar day. */
export function lastSortedDay(
  session: QuickSortSession,
  history: SortHistory,
): string | null {
  const id = lastSortedId(history)
  const key = id === null ? undefined : session.dayOf.get(id)
  return key === undefined || key === UNKNOWN_DAY ? null : key
}

/** First open item of the first other day that still has open items. */
export function nextDayStart(
  session: QuickSortSession,
  handled: ReadonlyMap<string, SortOutcome>,
  currentDay: string | null,
): string | null {
  for (const day of session.days) {
    if (day.key === currentDay) continue
    const first = day.ids.find((id) => !handled.has(id))
    if (first !== undefined) return first
  }
  return null
}

/** True when the whole day has been sorted in this session. */
export function dayIsDone(
  session: QuickSortSession,
  handled: ReadonlyMap<string, SortOutcome>,
  dayKey: string | null,
): boolean {
  if (dayKey === null) return false
  const day = session.days.find((d) => d.key === dayKey)
  return day?.ids.every((id) => handled.has(id)) === true
}
