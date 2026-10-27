import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  ensureFlowOwner,
  FLOW_MARKERS_PREFIX,
  onFlowStateCleared,
} from '@/features/journey-flow/api/flow-owner'
import {
  EMPTY_MARKERS,
  parseFlowMarkers,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'

/**
 * localStorage-backed flow markers, one key per user and journey. A
 * per-device convenience: blocked storage keeps the markers in memory for
 * the session, invalid stored data reads as empty (Zod at the boundary).
 * Another user signing in (or a sign-out) wipes them (flow-owner).
 */
export { FLOW_MARKERS_PREFIX }

const keyOf = (userId: string, journeyId: string) =>
  `${FLOW_MARKERS_PREFIX}${userId}:${journeyId}`

const cache = new Map<string, FlowMarkers>()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

onFlowStateCleared(() => {
  cache.clear()
  emit()
})

function readStored(key: string): FlowMarkers {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return EMPTY_MARKERS
    return parseFlowMarkers(JSON.parse(raw) as unknown)
  } catch {
    return EMPTY_MARKERS
  }
}

export function getFlowMarkers(userId: string, journeyId: string): FlowMarkers {
  const key = keyOf(userId, journeyId)
  const known = cache.get(key)
  if (known !== undefined) return known
  const read = readStored(key)
  cache.set(key, read)
  return read
}

/** Applies a pure transition and persists it. */
export function updateFlowMarkers(
  userId: string,
  journeyId: string,
  change: (markers: FlowMarkers) => FlowMarkers,
): FlowMarkers {
  ensureFlowOwner(userId)
  const key = keyOf(userId, journeyId)
  const current = getFlowMarkers(userId, journeyId)
  const next = change(current)
  if (next === current) return current
  cache.set(key, next)
  try {
    window.localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // Storage may be blocked or full; the markers live on for this session.
  }
  emit()
  return next
}

/** Drops the in-memory copies (tests; another tab wrote). */
export function resetFlowMarkersCache(): void {
  cache.clear()
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(FLOW_MARKERS_PREFIX) === true) {
      cache.delete(event.key)
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Markers of a journey for the signed-in user (empty when signed out). */
export function useFlowMarkers(
  userId: string | null,
  journeyId: string,
): FlowMarkers {
  // Keys are per user, so reading before the owner check is safe; the
  // check (which may wipe a previous user's state) runs outside render.
  useEffect(() => {
    if (userId !== null) ensureFlowOwner(userId)
  }, [userId])
  const read = useCallback(
    () => (userId === null ? EMPTY_MARKERS : getFlowMarkers(userId, journeyId)),
    [journeyId, userId],
  )
  return useSyncExternalStore(subscribe, read, read)
}
