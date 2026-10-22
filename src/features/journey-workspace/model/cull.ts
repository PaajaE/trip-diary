/**
 * Pure model of the culling session ("Výběr nejlepších"): navigation with the
 * starred-only filter, the auto-advance target and the session history used
 * by Undo. No React, no I/O.
 */

export interface CullEntry {
  id: string
  starred: boolean
  /** Moved to the trash (this session); dimmed and skipped by navigation. */
  trashed: boolean
}

export type CullActionType = 'star' | 'unstar' | 'trash'

export interface CullAction {
  id: string
  type: CullActionType
}

export type CullHistory = readonly CullAction[]

/** Whether navigation may land on the entry. */
export function isVisible(entry: CullEntry, filterStarred: boolean): boolean {
  return !entry.trashed && (!filterStarred || entry.starred)
}

function findVisible(
  entries: readonly CullEntry[],
  filterStarred: boolean,
  from: number,
  delta: 1 | -1,
): number | null {
  for (let i = from + delta; i >= 0 && i < entries.length; i += delta) {
    const entry = entries[i]
    if (entry !== undefined && isVisible(entry, filterStarred)) return i
  }
  return null
}

/** Next visible index in the direction, or null at the edge. */
export function stepIndex(
  entries: readonly CullEntry[],
  filterStarred: boolean,
  from: number,
  delta: 1 | -1,
): number | null {
  return findVisible(entries, filterStarred, from, delta)
}

/**
 * Where to go after acting on `from`: the next visible entry, otherwise the
 * previous visible one, otherwise null (nothing left to review).
 */
export function advanceTarget(
  entries: readonly CullEntry[],
  filterStarred: boolean,
  from: number,
): number | null {
  return (
    findVisible(entries, filterStarred, from, 1) ??
    findVisible(entries, filterStarred, from, -1)
  )
}

/** First visible index at or after `from`, falling back backwards. */
export function nearestVisible(
  entries: readonly CullEntry[],
  filterStarred: boolean,
  from: number,
): number | null {
  const entry = entries[from]
  if (entry !== undefined && isVisible(entry, filterStarred)) return from
  return advanceTarget(entries, filterStarred, from)
}

/** Action produced by the star key on an entry (toggle). */
export function starActionFor(entry: CullEntry): CullActionType {
  return entry.starred ? 'unstar' : 'star'
}

export function pushAction(
  history: CullHistory,
  action: CullAction,
): CullHistory {
  return [...history, action]
}

/** Removes the most recent occurrence (e.g. the save failed). */
export function dropAction(
  history: CullHistory,
  action: CullAction,
): CullHistory {
  for (let i = history.length - 1; i >= 0; i--) {
    const found = history[i]
    if (found?.id === action.id && found.type === action.type) {
      return [...history.slice(0, i), ...history.slice(i + 1)]
    }
  }
  return history
}

export function popAction(history: CullHistory): {
  action: CullAction | null
  history: CullHistory
} {
  const action = history[history.length - 1]
  if (action === undefined) return { action: null, history }
  return { action, history: history.slice(0, -1) }
}

export function countStarred(entries: readonly CullEntry[]): number {
  return entries.filter((entry) => entry.starred && !entry.trashed).length
}

export function countVisible(
  entries: readonly CullEntry[],
  filterStarred: boolean,
): number {
  return entries.filter((entry) => isVisible(entry, filterStarred)).length
}

/** Position of the entry among visible ones (1-based), 0 when not visible. */
export function positionAmongVisible(
  entries: readonly CullEntry[],
  filterStarred: boolean,
  index: number,
): number {
  let position = 0
  for (let i = 0; i <= index && i < entries.length; i++) {
    const entry = entries[i]
    if (entry !== undefined && isVisible(entry, filterStarred)) position++
  }
  const current = entries[index]
  return current !== undefined && isVisible(current, filterStarred)
    ? position
    : 0
}

export interface CullSummary {
  starred: number
  trashed: number
}

/** What this session did and still stands (undone or reverted work excluded). */
export function summarize(
  history: CullHistory,
  entries: readonly CullEntry[],
): CullSummary {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const starred = new Set<string>()
  const trashed = new Set<string>()
  for (const action of history) {
    const entry = byId.get(action.id)
    if (entry === undefined) continue
    if (action.type === 'trash' && entry.trashed) trashed.add(action.id)
    if (action.type === 'star' && entry.starred && !entry.trashed) {
      starred.add(action.id)
    }
  }
  return { starred: starred.size, trashed: trashed.size }
}
