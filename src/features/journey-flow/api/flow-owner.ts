import { localDb } from '@/shared/lib/local-db'

/**
 * The client-side flow state (flow markers in localStorage, the undo
 * snapshot in Dexie) belongs to one signed-in user. When another user signs
 * in on the device, or on sign-out, it is wiped.
 */
export const FLOW_OWNER_KEY = 'trip-diary:flow-owner'
export const FLOW_MARKERS_PREFIX = 'trip-diary:flow:'

const clearListeners = new Set<() => void>()

/** In-memory caches register here to be dropped with the stored state. */
export function onFlowStateCleared(listener: () => void): () => void {
  clearListeners.add(listener)
  return () => {
    clearListeners.delete(listener)
  }
}

function removeMarkerKeys(): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(FLOW_MARKERS_PREFIX) === true) keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
    window.localStorage.removeItem(FLOW_OWNER_KEY)
  } catch {
    // Storage may be blocked; nothing was stored then.
  }
}

/** Wipes the flow state of every user (sign-out). */
export async function clearFlowState(): Promise<void> {
  removeMarkerKeys()
  for (const listener of clearListeners) listener()
  await localDb.organizeSnapshots.clear().catch(() => undefined)
}

function storedOwner(): string | null {
  try {
    return window.localStorage.getItem(FLOW_OWNER_KEY)
  } catch {
    return null
  }
}

/**
 * Makes `userId` the owner of the flow state; the state of a previous owner
 * is wiped first. Synchronous for localStorage; the Dexie wipe runs in the
 * background (stale snapshot rows are also rejected by user id on read).
 */
export function ensureFlowOwner(userId: string): void {
  const owner = storedOwner()
  if (owner === userId) return
  if (owner !== null) {
    removeMarkerKeys()
    for (const listener of clearListeners) listener()
    void localDb.organizeSnapshots.clear().catch(() => undefined)
  }
  try {
    window.localStorage.setItem(FLOW_OWNER_KEY, userId)
  } catch {
    // Blocked storage: markers live in memory only.
  }
}
