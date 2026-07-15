export type SyncCoordinatorPhase =
  | 'idle'
  | 'processing'
  | 'waiting_for_network'
  | 'waiting_for_session'

export interface SyncCoordinatorSnapshot {
  failedCount: number
  lastDrainAt: string | null
  lastError: string | null
  lastProcessedCount: number
  pendingCount: number
  phase: SyncCoordinatorPhase
  retryableFailedCount: number
  terminalFailedCount: number
}

export type SyncCoordinatorListener = (
  snapshot: SyncCoordinatorSnapshot,
) => void

const INITIAL_SNAPSHOT: SyncCoordinatorSnapshot = {
  failedCount: 0,
  lastDrainAt: null,
  lastError: null,
  lastProcessedCount: 0,
  pendingCount: 0,
  phase: 'idle',
  retryableFailedCount: 0,
  terminalFailedCount: 0,
}

let snapshot: SyncCoordinatorSnapshot = INITIAL_SNAPSHOT
const listeners = new Set<SyncCoordinatorListener>()

export function getSyncCoordinatorSnapshot(): SyncCoordinatorSnapshot {
  return snapshot
}

export function updateSyncCoordinatorSnapshot(
  patch: Partial<SyncCoordinatorSnapshot>,
): SyncCoordinatorSnapshot {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) {
    listener(snapshot)
  }
  return snapshot
}

export function subscribeSyncCoordinatorSnapshot(
  listener: SyncCoordinatorListener,
): () => void {
  listeners.add(listener)
  listener(snapshot)

  return () => {
    listeners.delete(listener)
  }
}

export function resetSyncCoordinatorSnapshotForTests(): void {
  snapshot = INITIAL_SNAPSHOT
  listeners.clear()
}
