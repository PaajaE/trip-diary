import type { SyncDrainReason } from '@/foundation/sync/sync-drain-request'

export interface PhotoUploadSyncedEvent {
  entryId: string | null
  journeyId: string
  photoId: string
  storagePath: string
  thumbStoragePath: string | null
}

type PhotoUploadSyncedListener = (event: PhotoUploadSyncedEvent) => void

const listeners = new Set<PhotoUploadSyncedListener>()

export function notifyPhotoUploadSynced(event: PhotoUploadSyncedEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}

export function subscribePhotoUploadSynced(
  listener: PhotoUploadSyncedListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetPhotoUploadSyncedForTests(): void {
  listeners.clear()
}

export type { SyncDrainReason }
