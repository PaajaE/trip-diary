import type { SyncOperation } from '@/shared/sync/sync-operation'

export interface SyncProgressSnapshot {
  bytesTotal?: number
  bytesUploaded?: number
  current: number
  detail?: string
  label: string
  phase: SyncOperation['type'] | 'idle' | 'preparing'
  total: number
}

const idleProgress: SyncProgressSnapshot = {
  current: 0,
  label: '',
  phase: 'idle',
  total: 0,
}

let progress = idleProgress
const listeners = new Set<() => void>()

export function getSyncProgress(): SyncProgressSnapshot {
  return progress
}

export function subscribeSyncProgress(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function reportSyncProgress(next: SyncProgressSnapshot) {
  progress = next
  for (const listener of listeners) {
    listener()
  }
}

export function clearSyncProgress() {
  progress = idleProgress
  for (const listener of listeners) {
    listener()
  }
}
