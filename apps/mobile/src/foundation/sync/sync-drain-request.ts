export type SyncDrainReason =
  | 'app_foreground'
  | 'auth_ready'
  | 'enqueue'
  | 'manual_retry'
  | 'network_online'
  | 'startup'

export type SyncDrainRequestListener = (reason: SyncDrainReason) => void

const listeners = new Set<SyncDrainRequestListener>()

export function requestSyncDrain(reason: SyncDrainReason): void {
  for (const listener of listeners) {
    listener(reason)
  }
}

export function subscribeSyncDrainRequests(
  listener: SyncDrainRequestListener,
): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function resetSyncDrainRequestsForTests(): void {
  listeners.clear()
}
