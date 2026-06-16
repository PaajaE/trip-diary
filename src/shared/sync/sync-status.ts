import { localDb } from '@/shared/lib/local-db'

export type GlobalSyncStatus =
  | 'failed'
  | 'syncing'
  | 'pending'
  | 'offline'
  | 'synced'

export async function getSyncStatusSnapshot(
  creatorId: string,
): Promise<GlobalSyncStatus> {
  const [
    failedOperationCount,
    syncingOperationCount,
    pendingOperationCount,
    failedEntryCount,
    pendingEntryCount,
    syncingEntryCount,
    localEntryCount,
    failedPhotoCount,
    pendingPhotoCount,
    syncingPhotoCount,
  ] = await Promise.all([
    localDb.syncOperations
      .where('status')
      .equals('failed')
      .filter((operation) => operation.creatorId === creatorId)
      .count(),
    localDb.syncOperations
      .where('status')
      .equals('syncing')
      .filter((operation) => operation.creatorId === creatorId)
      .count(),
    localDb.syncOperations
      .where('status')
      .equals('pending')
      .filter((operation) => operation.creatorId === creatorId)
      .count(),
    localDb.entries
      .where('creatorId')
      .equals(creatorId)
      .filter((entry) => entry.syncStatus === 'failed')
      .count(),
    localDb.entries
      .where('creatorId')
      .equals(creatorId)
      .filter((entry) => entry.syncStatus === 'pending')
      .count(),
    localDb.entries
      .where('creatorId')
      .equals(creatorId)
      .filter((entry) => entry.syncStatus === 'syncing')
      .count(),
    localDb.entries
      .where('creatorId')
      .equals(creatorId)
      .filter((entry) => entry.syncStatus === 'local')
      .count(),
    localDb.photos
      .where('creatorId')
      .equals(creatorId)
      .filter((photo) => photo.syncStatus === 'failed')
      .count(),
    localDb.photos
      .where('creatorId')
      .equals(creatorId)
      .filter((photo) => photo.syncStatus === 'pending')
      .count(),
    localDb.photos
      .where('creatorId')
      .equals(creatorId)
      .filter((photo) => photo.syncStatus === 'syncing')
      .count(),
  ])

  const failedCount = failedOperationCount + failedEntryCount + failedPhotoCount
  const syncingCount =
    syncingOperationCount + syncingEntryCount + syncingPhotoCount
  const pendingCount =
    pendingOperationCount +
    pendingEntryCount +
    localEntryCount +
    pendingPhotoCount

  if (failedCount > 0) {
    return 'failed'
  }
  if (syncingCount > 0) {
    return 'syncing'
  }
  if (pendingCount > 0) {
    return 'pending'
  }
  if (!navigator.onLine) {
    return 'offline'
  }
  return 'synced'
}
