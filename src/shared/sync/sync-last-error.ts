import { localDb } from '@/shared/lib/local-db'
import type { SyncOperation } from '@/shared/sync/sync-operation'

let lastError: string | null = null
const listeners = new Set<() => void>()

export function getLastSyncError(): string | null {
  return lastError
}

export function subscribeLastSyncError(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function reportSyncError(message: string) {
  lastError = message
  for (const listener of listeners) {
    listener()
  }
}

export function clearSyncError() {
  lastError = null
  for (const listener of listeners) {
    listener()
  }
}

export function formatSyncError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return 'Synchronization failed'
}

export async function shouldWaitForEntry(entryId: string): Promise<boolean> {
  const activeEntryCreate =
    (await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'entry.create' &&
          operation.entryId === entryId &&
          (operation.status === 'pending' || operation.status === 'syncing'),
      )
      .count()) > 0
  if (activeEntryCreate) {
    return true
  }

  const entry = await localDb.entries.get(entryId)
  return entry !== undefined && entry.syncStatus !== 'synced'
}

export async function shouldWaitForJourney(journeyId: string): Promise<boolean> {
  const activeJourneyCreate =
    (await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'journey.create' &&
          operation.journeyId === journeyId &&
          (operation.status === 'pending' || operation.status === 'syncing'),
      )
      .count()) > 0
  if (activeJourneyCreate) {
    return true
  }

  const journey = await localDb.localJourneys.get(journeyId)
  return journey !== undefined && journey.syncStatus !== 'synced'
}

export async function shouldWaitForPhotoUpload(photoId: string): Promise<boolean> {
  const photo = await localDb.photos.get(photoId)
  if (photo === undefined) {
    return false
  }

  return shouldWaitForEntry(photo.entryId)
}

export async function shouldWaitForPhotoSync(photoId: string): Promise<boolean> {
  const activePhotoUpload =
    (await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'photo.upload' &&
          operation.photoId === photoId &&
          (operation.status === 'pending' || operation.status === 'syncing'),
      )
      .count()) > 0
  if (activePhotoUpload) {
    return true
  }

  const photo = await localDb.photos.get(photoId)
  if (photo === undefined) {
    return false
  }
  if (photo.syncStatus !== 'synced') {
    return true
  }

  return shouldWaitForPhotoUpload(photoId)
}

export async function hasIncompleteCreateOperation(
  predicate: (operation: SyncOperation) => boolean,
): Promise<boolean> {
  return (
    (await localDb.syncOperations
      .filter(
        (operation) =>
          predicate(operation) &&
          (operation.status === 'pending' || operation.status === 'syncing'),
      )
      .count()) > 0
  )
}
