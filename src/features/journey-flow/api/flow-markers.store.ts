import { useCallback, useSyncExternalStore } from 'react'
import {
  EMPTY_MARKERS,
  parseFlowMarkers,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'

/**
 * localStorage-backed flow markers (one key per journey). A per-device
 * convenience: blocked storage keeps the markers in memory for the session,
 * invalid stored data reads as empty (Zod at the boundary).
 */
export const FLOW_MARKERS_PREFIX = 'trip-diary:flow:'

const keyOf = (journeyId: string) => `${FLOW_MARKERS_PREFIX}${journeyId}`

const cache = new Map<string, FlowMarkers>()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function readStored(journeyId: string): FlowMarkers {
  try {
    const raw = window.localStorage.getItem(keyOf(journeyId))
    if (raw === null) return EMPTY_MARKERS
    return parseFlowMarkers(JSON.parse(raw) as unknown)
  } catch {
    return EMPTY_MARKERS
  }
}

export function getFlowMarkers(journeyId: string): FlowMarkers {
  const known = cache.get(journeyId)
  if (known !== undefined) return known
  const read = readStored(journeyId)
  cache.set(journeyId, read)
  return read
}

/** Applies a pure transition and persists it. */
export function updateFlowMarkers(
  journeyId: string,
  change: (markers: FlowMarkers) => FlowMarkers,
): FlowMarkers {
  const current = getFlowMarkers(journeyId)
  const next = change(current)
  if (next === current) return current
  cache.set(journeyId, next)
  try {
    window.localStorage.setItem(keyOf(journeyId), JSON.stringify(next))
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
      cache.delete(event.key.slice(FLOW_MARKERS_PREFIX.length))
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Markers of a journey, re-rendering when they change. */
export function useFlowMarkers(journeyId: string): FlowMarkers {
  const read = useCallback(() => getFlowMarkers(journeyId), [journeyId])
  return useSyncExternalStore(subscribe, read, read)
}
