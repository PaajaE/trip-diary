import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getJourneySnapshot } from '@/entities/journey/api/local-journey-cache.repository'
import { getLocalJourney } from '@/entities/journey/api/local-journey.repository'
import type { LocalPhotoVariant } from '@/entities/photo/model/photo'
import { deletePhotoOnRemote } from '@/entities/photo/api/photo-mutation.repository'
import {
  assignPhotoTagRemote,
  removePhotoTagRemote,
} from '@/entities/photo/api/photo-tag.repository'
import {
  clearLocalPhotoTagAssignment,
  markLocalPhotoTagAssignmentSynced,
} from '@/entities/photo/api/local-photo-tag.repository'
import { SYNC_PHOTO_VARIANT_KINDS } from '@/entities/photo/lib/photo-variant-config'
import { isMeaningfulGpsCoordinate } from '@/entities/photo/lib/photo-exif-gps'
import { listMySpaces } from '@/entities/space/api/space.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { clearDeletedRecord } from '@/shared/lib/local-deleted-records'
import { createPublicSlug } from '@/shared/lib/slug'
import { resolveSyncOperationDetail } from '@/shared/sync/sync-operation-detail'
import {
  clearSyncError,
  formatSyncError,
  hasIncompleteCreateOperation,
  reportSyncError,
  shouldWaitForEntry,
  shouldWaitForJourney,
  shouldWaitForPhotoSync,
  shouldWaitForPhotoUpload,
} from '@/shared/sync/sync-last-error'
import {
  clearSyncProgress,
  getSyncProgress,
  reportSyncProgress,
} from '@/shared/sync/sync-progress'
import type { SyncOperation } from '@/shared/sync/sync-operation'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export const STALE_SYNCING_OPERATION_MS = 90_000
export const APP_RESUME_STALE_SYNC_MS = 30_000

export async function prepareManualSync(creatorId: string): Promise<void> {
  await forceResetSyncingOperations(creatorId)
  await repairSyncQueue(creatorId)

  const failedOperations = await localDb.syncOperations
    .where('status')
    .equals('failed')
    .filter((operation) => operation.creatorId === creatorId)
    .toArray()
  if (failedOperations.length > 0) {
    await localDb.syncOperations.bulkPut(
      failedOperations.map((operation) => ({
        ...operation,
        status: 'pending' as const,
      })),
    )
  }

  const failedEntries = await localDb.entries
    .where('creatorId')
    .equals(creatorId)
    .filter((entry) => entry.syncStatus === 'failed')
    .toArray()
  for (const entry of failedEntries) {
    await localDb.entries.update(entry.id, { syncStatus: 'pending' })
  }

  const failedPhotos = await localDb.photos
    .where('creatorId')
    .equals(creatorId)
    .filter((photo) => photo.syncStatus === 'failed')
    .toArray()
  for (const photo of failedPhotos) {
    await localDb.photos.update(photo.id, { syncStatus: 'pending' })
  }
}

async function repairSyncQueue(creatorId: string): Promise<void> {
  const unsyncedEntries = await localDb.entries
    .where('creatorId')
    .equals(creatorId)
    .filter((entry) => entry.syncStatus !== 'synced')
    .toArray()

  for (const entry of unsyncedEntries) {
    const hasCreateOperation =
      (await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'entry.create' &&
            operation.entryId === entry.id &&
            operation.creatorId === creatorId,
        )
        .count()) > 0
    if (hasCreateOperation) {
      continue
    }

    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: new Date().toISOString(),
        creatorId,
        entryId: entry.id,
        id: crypto.randomUUID(),
        status: 'pending',
        type: 'entry.create',
      }),
    )
  }

  const unsyncedPhotos = await localDb.photos
    .where('creatorId')
    .equals(creatorId)
    .filter((photo) => photo.syncStatus !== 'synced')
    .toArray()

  for (const photo of unsyncedPhotos) {
    const variantCount = await localDb.photoVariants
      .where('photoId')
      .equals(photo.id)
      .count()
    if (variantCount === 0) {
      continue
    }

    const hasUploadOperation =
      (await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'photo.upload' &&
            operation.photoId === photo.id &&
            operation.creatorId === creatorId,
        )
        .count()) > 0
    if (hasUploadOperation) {
      continue
    }

    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: new Date().toISOString(),
        creatorId,
        id: crypto.randomUUID(),
        photoId: photo.id,
        status: 'pending',
        type: 'photo.upload',
      }),
    )
  }

  const localLinks = await localDb.journeyLinks
    .where('creatorId')
    .equals(creatorId)
    .toArray()

  for (const link of localLinks) {
    const hasAssignmentOperation =
      (await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'journey.assignment.upsert' &&
            operation.entryId === link.entryId &&
            operation.creatorId === creatorId,
        )
        .count()) > 0
    if (hasAssignmentOperation) {
      continue
    }

    const operationId = crypto.randomUUID()
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: new Date().toISOString(),
        creatorId: link.creatorId,
        entryId: link.entryId,
        id: operationId,
        journeyId: link.journeyId,
        latitude: link.latitude,
        locationTitle: link.locationTitle,
        longitude: link.longitude,
        stageId: link.stageId,
        status: 'pending',
        stopId: link.stopId,
        type: 'journey.assignment.upsert',
      }),
    )
    await localDb.journeyLinks.update(link.entryId, {
      syncOperationId: operationId,
    })
  }

  const pendingTagAssignments = await localDb.localPhotoTagAssignments
    .where('creatorId')
    .equals(creatorId)
    .filter((assignment) => assignment.syncStatus === 'pending')
    .toArray()

  for (const assignment of pendingTagAssignments) {
    const hasAssignOperation =
      (await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'photo.tag.assign' &&
            operation.photoId === assignment.photoId &&
            operation.slug === assignment.slug &&
            operation.creatorId === creatorId,
        )
        .count()) > 0
    if (hasAssignOperation) {
      continue
    }

    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: new Date().toISOString(),
        creatorId: assignment.creatorId,
        id: crypto.randomUUID(),
        journeyId: assignment.journeyId,
        label: assignment.label,
        photoId: assignment.photoId,
        slug: assignment.slug,
        status: 'pending',
        tagId: assignment.tagId,
        type: 'photo.tag.assign',
      }),
    )
  }
}

async function resolveSyncCreatorId(): Promise<string> {
  const client = getSupabaseClient()
  const {
    data: { session },
  } = await client.auth.getSession()
  if (session?.user.id !== undefined) {
    return session.user.id
  }

  const { data, error } = await client.auth.getUser()
  if (error !== null) {
    throw error
  }
  return data.user.id
}

export async function syncPendingOperations(): Promise<void> {
  let creatorId: string
  try {
    creatorId = await resolveSyncCreatorId()
  } catch (error) {
    const message = formatSyncError(error)
    reportSyncError(message)
    throw error
  }

  await recoverStaleSyncingOperations(creatorId)

  const operations = await localDb.syncOperations
    .where('status')
    .anyOf(['pending', 'failed'])
    .filter((operation) => operation.creatorId === creatorId)
    .sortBy('createdAt')

  const errors: Error[] = []
  clearSyncProgress()
  reportSyncProgress({
    current: 0,
    label: '',
    phase: 'preparing',
    total: operations.length,
  })

  let processedCount = 0
  let skippedCount = 0
  for (const operation of operations) {
    if (await hasUnfinishedDependency(operation)) {
      skippedCount += 1
      continue
    }

    processedCount += 1
    const detail = await resolveSyncOperationDetail(operation)
    reportSyncProgress({
      current: processedCount,
      detail,
      label: detail,
      phase: operation.type,
      total: operations.length,
    })

    await localDb.syncOperations.update(operation.id, {
      lastAttemptAt: new Date().toISOString(),
      status: 'syncing',
    })

    try {
      switch (operation.type) {
        case 'entry.create':
          await syncEntryCreate(operation, creatorId)
          break
        case 'entry.update':
          await syncEntryUpdate(operation)
          break
        case 'entry.delete':
          await syncEntryDelete(operation)
          break
        case 'journey.create':
          await syncJourneyCreate(operation)
          break
        case 'journey.update':
          await syncJourneyUpdate(operation)
          break
        case 'journey.delete':
          await syncJourneyDelete(operation)
          break
        case 'stage.create':
          await syncStageCreate(operation)
          break
        case 'stop.create':
          await syncStopCreate(operation)
          break
        case 'stop.update':
          await syncStopUpdate(operation)
          break
        case 'guide.create':
          await syncGuideCreate(operation)
          break
        case 'stage.update':
          await syncStageUpdate(operation)
          break
        case 'stage.delete':
          await syncStageDelete(operation)
          break
        case 'stop.delete':
          await syncStopDelete(operation)
          break
        case 'guide.update':
          await syncGuideUpdate(operation)
          break
        case 'guide.delete':
          await syncGuideDelete(operation)
          break
        case 'journey.assignment.upsert':
          await syncJourneyAssignment(operation)
          break
        case 'photo.upload':
          await syncPhotoUpload(operation, creatorId)
          break
        case 'photo.gps.update':
          await syncPhotoGpsUpdate(operation)
          break
        case 'photo.delete':
          await syncPhotoDelete(operation)
          break
        case 'photo.tag.assign':
          await syncPhotoTagAssign(operation)
          break
        case 'photo.tag.remove':
          await syncPhotoTagRemove(operation)
          break
      }
    } catch (error) {
      const message = `${operation.type}: ${formatSyncError(error)}`
      console.error('[sync]', operation.type, message)
      reportSyncError(message)
      await localDb.syncOperations.update(operation.id, { status: 'failed' })
      if (operation.type === 'entry.create') {
        await localDb.entries.update(operation.entryId, {
          syncStatus: 'failed',
        })
      } else if (operation.type === 'journey.create') {
        await localDb.localJourneys.update(operation.journeyId, {
          syncStatus: 'failed',
        })
      } else if (operation.type === 'photo.upload') {
        await localDb.photos.update(operation.photoId, { syncStatus: 'failed' })
      } else if (operation.type === 'entry.update') {
        await localDb.entries.update(operation.entryId, {
          syncStatus: 'failed',
        })
      }
      errors.push(new Error(message))
    }
  }

  if (operations.length > 0 && processedCount === 0) {
    const message =
      skippedCount === operations.length
        ? 'Sync is waiting for earlier steps to finish. Try again in a moment.'
        : 'Sync could not start any pending work.'
    reportSyncError(message)
    clearSyncProgress()
    throw new Error(message)
  }

  const firstError = errors[0]
  if (firstError !== undefined) {
    clearSyncProgress()
    throw firstError
  }

  clearSyncError()
  clearSyncProgress()
}

export async function recoverStaleSyncingOperations(
  creatorId: string,
  maxAgeMs = STALE_SYNCING_OPERATION_MS,
): Promise<void> {
  const staleBefore = Date.now() - maxAgeMs
  const staleOperations = await localDb.syncOperations
    .where('status')
    .equals('syncing')
    .filter(
      (operation) =>
        operation.creatorId === creatorId &&
        (operation.lastAttemptAt === undefined ||
          new Date(operation.lastAttemptAt).valueOf() <= staleBefore),
    )
    .toArray()

  if (staleOperations.length === 0) {
    return
  }

  await localDb.syncOperations.bulkPut(
    staleOperations.map((operation) => ({
      ...operation,
      status: 'pending' as const,
    })),
  )

  for (const operation of staleOperations) {
    if (operation.type === 'photo.upload') {
      await localDb.photos.update(operation.photoId, { syncStatus: 'pending' })
    } else if (operation.type === 'entry.create') {
      await localDb.entries.update(operation.entryId, { syncStatus: 'pending' })
    } else if (operation.type === 'journey.create') {
      await localDb.localJourneys.update(operation.journeyId, {
        syncStatus: 'pending',
      })
    }
  }
}

export async function recoverSyncOnAppResume(creatorId: string): Promise<void> {
  await recoverStaleSyncingOperations(creatorId, APP_RESUME_STALE_SYNC_MS)
}

export async function forceResetSyncingOperations(
  creatorId: string,
): Promise<void> {
  await recoverStaleSyncingOperations(creatorId, 0)
}

async function hasUnfinishedDependency(
  operation: SyncOperation,
): Promise<boolean> {
  if (
    operation.type === 'entry.update' ||
    operation.type === 'entry.delete' ||
    operation.type === 'journey.assignment.upsert'
  ) {
    if (await shouldWaitForEntry(operation.entryId)) {
      return true
    }
  }

  if (operation.type === 'journey.assignment.upsert') {
    if (await shouldWaitForJourney(operation.journeyId)) {
      return true
    }
  }

  if (operation.type === 'journey.delete') {
    if (await shouldWaitForJourney(operation.journeyId)) {
      return true
    }
  }

  if (
    operation.type === 'stage.create' ||
    operation.type === 'stop.create' ||
    operation.type === 'guide.create'
  ) {
    if (await shouldWaitForJourney(operation.journeyId)) {
      return true
    }
  }

  if (operation.type === 'stop.create') {
    const localStop = await localDb.localJourneyStops.get(operation.stopId)
    const stageId = localStop?.stageId
    if (stageId !== null && stageId !== undefined) {
      if (
        await hasIncompleteCreateOperation(
          (candidate) =>
            candidate.type === 'stage.create' && candidate.stageId === stageId,
        )
      ) {
        return true
      }
    }
  }

  if (operation.type === 'stage.update' || operation.type === 'stage.delete') {
    if (
      await hasIncompleteCreateOperation(
        (candidate) =>
          candidate.type === 'stage.create' &&
          candidate.stageId === operation.stageId,
      )
    ) {
      return true
    }
  }

  if (operation.type === 'stop.update' || operation.type === 'stop.delete') {
    if (
      await hasIncompleteCreateOperation(
        (candidate) =>
          candidate.type === 'stop.create' &&
          candidate.stopId === operation.stopId,
      )
    ) {
      return true
    }
  }

  if (operation.type === 'guide.update' || operation.type === 'guide.delete') {
    if (
      await hasIncompleteCreateOperation(
        (candidate) =>
          candidate.type === 'guide.create' &&
          candidate.guideId === operation.guideId,
      )
    ) {
      return true
    }
  }

  if (operation.type === 'photo.upload') {
    if (await shouldWaitForPhotoUpload(operation.photoId)) {
      return true
    }
  }

  if (operation.type === 'photo.gps.update') {
    if (await shouldWaitForPhotoSync(operation.photoId)) {
      return true
    }
  }

  if (operation.type === 'photo.delete') {
    if (await shouldWaitForPhotoSync(operation.photoId)) {
      return true
    }
  }

  if (
    operation.type === 'photo.tag.assign' ||
    operation.type === 'photo.tag.remove'
  ) {
    if (await shouldWaitForPhotoSync(operation.photoId)) {
      return true
    }
  }

  return false
}

type EntryCreateOperation = Extract<SyncOperation, { type: 'entry.create' }>
type EntryUpdateOperation = Extract<SyncOperation, { type: 'entry.update' }>
type EntryDeleteOperation = Extract<SyncOperation, { type: 'entry.delete' }>
type JourneyCreateOperation = Extract<SyncOperation, { type: 'journey.create' }>
type JourneyUpdateOperation = Extract<SyncOperation, { type: 'journey.update' }>
type JourneyDeleteOperation = Extract<SyncOperation, { type: 'journey.delete' }>
type StageCreateOperation = Extract<SyncOperation, { type: 'stage.create' }>
type StopCreateOperation = Extract<SyncOperation, { type: 'stop.create' }>
type StopUpdateOperation = Extract<SyncOperation, { type: 'stop.update' }>
type GuideCreateOperation = Extract<SyncOperation, { type: 'guide.create' }>
type StageUpdateOperation = Extract<SyncOperation, { type: 'stage.update' }>
type StageDeleteOperation = Extract<SyncOperation, { type: 'stage.delete' }>
type StopDeleteOperation = Extract<SyncOperation, { type: 'stop.delete' }>
type GuideUpdateOperation = Extract<SyncOperation, { type: 'guide.update' }>
type GuideDeleteOperation = Extract<SyncOperation, { type: 'guide.delete' }>
type JourneyAssignmentOperation = Extract<
  SyncOperation,
  { type: 'journey.assignment.upsert' }
>
type PhotoUploadOperation = Extract<SyncOperation, { type: 'photo.upload' }>
type PhotoGpsUpdateOperation = Extract<
  SyncOperation,
  { type: 'photo.gps.update' }
>
type PhotoDeleteOperation = Extract<SyncOperation, { type: 'photo.delete' }>
type PhotoTagAssignOperation = Extract<
  SyncOperation,
  { type: 'photo.tag.assign' }
>
type PhotoTagRemoveOperation = Extract<
  SyncOperation,
  { type: 'photo.tag.remove' }
>

async function syncEntryCreate(
  operation: EntryCreateOperation,
  creatorId: string,
): Promise<void> {
  await localDb.entries.update(operation.entryId, { syncStatus: 'syncing' })
  const entry = await getLocalEntry(operation.entryId)
  if (entry === null) {
    await localDb.syncOperations.delete(operation.id)
    return
  }
  const spaceId = entry.spaceId ?? (await getFallbackSpaceId(creatorId))
  const slug = entry.slug ?? createPublicSlug(entry.title, entry.id)

  const { data: serverEntry, error } = await getSupabaseClient()
    .from('entries')
    .upsert(
      {
        body: entry.body,
        creator_id: entry.creatorId,
        event_at: entry.eventAt,
        id: entry.id,
        language: entry.language,
        slug,
        space_id: spaceId,
        status: 'published',
        title: entry.title,
        type: entry.type,
        visibility: entry.visibility,
      },
      { ignoreDuplicates: true, onConflict: 'id' },
    )
    .select('creator_id, published_at, status, updated_at, version')
    .single()

  if (error !== null) {
    throw error
  }

  if (
    serverEntry.creator_id !== creatorId ||
    serverEntry.status !== 'published' ||
    serverEntry.published_at === null
  ) {
    throw new Error('Entry synchronization could not be confirmed')
  }

  await localDb.transaction(
    'rw',
    localDb.entries,
    localDb.syncOperations,
    async () => {
      await localDb.entries.update(entry.id, {
        publishedAt: serverEntry.published_at,
        slug,
        spaceId,
        status: 'published',
        syncStatus: 'synced',
        updatedAt: serverEntry.updated_at,
        version: serverEntry.version,
      })
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncEntryUpdate(operation: EntryUpdateOperation): Promise<void> {
  const entry = await getLocalEntry(operation.entryId)
  if (entry === null) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  await localDb.entries.update(entry.id, { syncStatus: 'syncing' })
  const { data, error } = await getSupabaseClient().rpc('update_entry', {
    p_body: entry.body,
    p_event_at: entry.eventAt,
    p_expected_version: operation.expectedVersion,
    p_id: entry.id,
    p_language: entry.language,
    p_latitude: null,
    p_longitude: null,
    p_status: entry.status,
    p_title: entry.title,
    p_type: entry.type,
    p_visibility: entry.visibility,
  })

  if (error !== null) {
    throw error
  }

  const row = data[0]
  if (row === undefined) {
    throw new Error('Entry update could not be confirmed')
  }

  await localDb.transaction(
    'rw',
    localDb.entries,
    localDb.syncOperations,
    async () => {
      await localDb.entries.update(entry.id, {
        syncStatus: 'synced',
        updatedAt: row.updated_at,
        version: row.version,
      })
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncEntryDelete(operation: EntryDeleteOperation): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('entries')
    .delete()
    .eq('id', operation.entryId)

  if (error !== null) {
    throw error
  }

  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.syncOperations,
    async () => {
      await clearDeletedRecord(operation.entryId)
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncJourneyCreate(
  operation: JourneyCreateOperation,
): Promise<void> {
  const draft = await getLocalJourney(operation.journeyId)
  if (draft === null) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  await localDb.localJourneys.update(draft.id, { syncStatus: 'syncing' })
  const { error } = await getSupabaseClient().from('journeys').insert({
    creator_id: draft.creatorId,
    ends_at: draft.endsAt,
    id: draft.id,
    slug: draft.slug,
    space_id: draft.spaceId,
    starts_at: draft.startsAt,
    summary: draft.summary,
    title: draft.title,
    visibility: 'public',
  })

  if (error !== null) {
    throw error
  }

  const { data: confirmedJourney, error: confirmationError } =
    await getSupabaseClient()
      .from('journeys')
      .select('id, title')
      .eq('id', draft.id)
      .single()

  if (
    confirmationError !== null ||
    confirmedJourney.id !== draft.id ||
    confirmedJourney.title !== draft.title
  ) {
    throw new Error('Journey synchronization could not be confirmed')
  }

  await localDb.transaction(
    'rw',
    localDb.localJourneys,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneys.update(draft.id, { syncStatus: 'synced' })
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncJourneyUpdate(
  operation: JourneyUpdateOperation,
): Promise<void> {
  const snapshot = await getJourneySnapshot(operation.journeyId)
  if (snapshot === null) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  const { error } = await getSupabaseClient()
    .from('journeys')
    .update({
      ends_at: snapshot.journey.endsAt,
      starts_at: snapshot.journey.startsAt,
      summary: snapshot.journey.summary,
      title: snapshot.journey.title,
    })
    .eq('id', operation.journeyId)

  if (error !== null) {
    throw error
  }

  await localDb.syncOperations.delete(operation.id)
}

async function syncJourneyDelete(
  operation: JourneyDeleteOperation,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journeys')
    .delete()
    .eq('id', operation.journeyId)

  if (error !== null) {
    throw error
  }

  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.journeySnapshots,
    localDb.syncOperations,
    async () => {
      await clearDeletedRecord(operation.journeyId)
      await localDb.journeySnapshots.delete(operation.journeyId)
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncStageCreate(operation: StageCreateOperation): Promise<void> {
  const stage = await localDb.localJourneyStages.get(operation.stageId)
  if (stage === undefined) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  await localDb.localJourneyStages.update(stage.id, { syncStatus: 'syncing' })
  const { error } = await getSupabaseClient().from('journey_stages').insert({
    creator_id: stage.creatorId,
    id: stage.id,
    journey_id: stage.journeyId,
    position: stage.position,
    summary: stage.summary,
    title: stage.title,
  })

  if (error !== null && !isDuplicateInsertError(error)) {
    throw error
  }

  await localDb.transaction(
    'rw',
    localDb.localJourneyStages,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyStages.delete(stage.id)
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncStopCreate(operation: StopCreateOperation): Promise<void> {
  const stop = await localDb.localJourneyStops.get(operation.stopId)
  if (stop === undefined) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  await localDb.localJourneyStops.update(stop.id, { syncStatus: 'syncing' })
  const { error } = await getSupabaseClient()
    .from('journey_stops')
    .insert({
      creator_id: stop.creatorId,
      id: stop.id,
      journey_id: stop.journeyId,
      latitude: stop.mapLatitude,
      longitude: stop.mapLongitude,
      map_latitude:
        stop.mapLatitude === null
          ? null
          : Math.round(stop.mapLatitude * 100) / 100,
      map_longitude:
        stop.mapLongitude === null
          ? null
          : Math.round(stop.mapLongitude * 100) / 100,
      notes: stop.notes,
      position: stop.position,
      stage_id: stop.stageId,
      status: stop.status,
      title: stop.title,
    })

  if (error !== null && !isDuplicateInsertError(error)) {
    throw error
  }

  await localDb.transaction(
    'rw',
    localDb.localJourneyStops,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyStops.delete(stop.id)
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncGuideCreate(operation: GuideCreateOperation): Promise<void> {
  const guide = await localDb.localJourneyGuides.get(operation.guideId)
  if (guide === undefined) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  await localDb.localJourneyGuides.update(guide.id, { syncStatus: 'syncing' })
  const { error } = await getSupabaseClient()
    .from('journey_guide_sections')
    .insert({
      body: guide.body,
      creator_id: guide.creatorId,
      id: guide.id,
      journey_id: guide.journeyId,
      position: guide.position,
      title: guide.title,
    })

  if (error !== null && !isDuplicateInsertError(error)) {
    throw error
  }

  await localDb.transaction(
    'rw',
    localDb.localJourneyGuides,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyGuides.delete(guide.id)
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncStageUpdate(operation: StageUpdateOperation): Promise<void> {
  const snapshot = await getJourneySnapshot(operation.journeyId)
  const stage = snapshot?.journey.stages.find(
    (item) => item.id === operation.stageId,
  )
  if (stage === undefined) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  const { error } = await getSupabaseClient()
    .from('journey_stages')
    .update({ summary: stage.summary, title: stage.title })
    .eq('id', operation.stageId)

  if (error !== null) {
    throw error
  }

  await localDb.syncOperations.delete(operation.id)
}

async function syncStageDelete(operation: StageDeleteOperation): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journey_stages')
    .delete()
    .eq('id', operation.stageId)

  if (error !== null) {
    throw error
  }

  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.syncOperations,
    async () => {
      await clearDeletedRecord(operation.stageId)
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncStopUpdate(operation: StopUpdateOperation): Promise<void> {
  const snapshot = await getJourneySnapshot(operation.journeyId)
  const stop = snapshot?.journey.stops.find(
    (item) => item.id === operation.stopId,
  )
  if (stop === undefined) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  const { error } = await getSupabaseClient()
    .from('journey_stops')
    .update({
      latitude: stop.mapLatitude,
      longitude: stop.mapLongitude,
      map_latitude:
        stop.mapLatitude === null
          ? null
          : Math.round(stop.mapLatitude * 100) / 100,
      map_longitude:
        stop.mapLongitude === null
          ? null
          : Math.round(stop.mapLongitude * 100) / 100,
      notes: stop.notes,
      stage_id: stop.stageId,
      status: stop.status,
      title: stop.title,
    })
    .eq('id', operation.stopId)

  if (error !== null) {
    throw error
  }

  await localDb.syncOperations.delete(operation.id)
}

async function syncStopDelete(operation: StopDeleteOperation): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journey_stops')
    .delete()
    .eq('id', operation.stopId)

  if (error !== null) {
    throw error
  }

  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.syncOperations,
    async () => {
      await clearDeletedRecord(operation.stopId)
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncGuideUpdate(operation: GuideUpdateOperation): Promise<void> {
  const snapshot = await getJourneySnapshot(operation.journeyId)
  const guide = snapshot?.journey.guides.find(
    (item) => item.id === operation.guideId,
  )
  if (guide === undefined) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  const { error } = await getSupabaseClient()
    .from('journey_guide_sections')
    .update({ body: guide.body, title: guide.title })
    .eq('id', operation.guideId)

  if (error !== null) {
    throw error
  }

  await localDb.syncOperations.delete(operation.id)
}

async function syncGuideDelete(operation: GuideDeleteOperation): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journey_guide_sections')
    .delete()
    .eq('id', operation.guideId)

  if (error !== null) {
    throw error
  }

  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.syncOperations,
    async () => {
      await clearDeletedRecord(operation.guideId)
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncJourneyAssignment(
  operation: JourneyAssignmentOperation,
): Promise<void> {
  const client = getSupabaseClient()
  const rpcInput = {
    p_entry_id: operation.entryId,
    p_journey_id: operation.journeyId,
    ...(operation.latitude === null ? {} : { p_latitude: operation.latitude }),
    ...(operation.locationTitle === null
      ? {}
      : { p_location_title: operation.locationTitle }),
    ...(operation.longitude === null
      ? {}
      : { p_longitude: operation.longitude }),
    ...(operation.stageId === null ? {} : { p_stage_id: operation.stageId }),
    ...(operation.stopId === null ? {} : { p_stop_id: operation.stopId }),
  }
  const { error } = await client.rpc(
    'upsert_journey_moment_assignment',
    rpcInput,
  )

  if (error !== null) {
    throw error
  }

  const { data: confirmedLink, error: confirmationError } = await client
    .from('entry_journey_links')
    .select('entry_id, journey_id, stage_id, stop_id')
    .eq('entry_id', operation.entryId)
    .single()
  if (
    confirmationError !== null ||
    confirmedLink.entry_id !== operation.entryId ||
    confirmedLink.journey_id !== operation.journeyId ||
    confirmedLink.stage_id !== operation.stageId ||
    confirmedLink.stop_id !== operation.stopId
  ) {
    throw new Error('Journey assignment synchronization could not be confirmed')
  }

  await localDb.transaction(
    'rw',
    localDb.journeyLinks,
    localDb.syncOperations,
    async () => {
      const localLink = await localDb.journeyLinks.get(operation.entryId)
      if (
        localLink?.syncOperationId === operation.id &&
        localLink.journeyId === operation.journeyId &&
        localLink.stageId === operation.stageId &&
        localLink.stopId === operation.stopId
      ) {
        await localDb.journeyLinks.delete(operation.entryId)
      }
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function getFallbackSpaceId(userId: string): Promise<string> {
  const spaces = await listMySpaces(userId)
  const space = spaces.find(({ kind }) => kind === 'personal') ?? spaces[0]
  if (space === undefined) {
    throw new Error('A publishing space is required')
  }
  return space.id
}

async function syncPhotoUpload(
  operation: PhotoUploadOperation,
  creatorId: string,
): Promise<void> {
  const photo = await localDb.photos.get(operation.photoId)
  const variants = await localDb.photoVariants
    .where('photoId')
    .equals(operation.photoId)
    .toArray()

  if (photo === undefined || variants.length === 0) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  const variantsToUpload = variants.filter((variant) =>
    SYNC_PHOTO_VARIANT_KINDS.has(variant.kind),
  )

  if (variantsToUpload.length === 0) {
    throw new Error('No syncable photo variants found')
  }

  await localDb.photos.update(photo.id, { syncStatus: 'syncing' })
  const client = getSupabaseClient()
  await syncPhotoMetadata(client, photo, creatorId)

  for (const variant of variantsToUpload) {
    const snapshot = getSyncProgress()
    reportSyncProgress({
      ...snapshot,
      detail: variant.kind,
    })
    await declareAndUploadVariant(variant, creatorId)
  }

  const { error: linkError } = await client.from('entry_photos').upsert(
    {
      creator_id: creatorId,
      entry_id: photo.entryId,
      photo_id: photo.id,
      position: photo.position,
    },
    { ignoreDuplicates: true, onConflict: 'entry_id,photo_id' },
  )
  if (linkError !== null) {
    throw linkError
  }

  const { data: confirmedPhoto, error: confirmationError } = await client
    .from('entry_photos')
    .select('photo_id')
    .eq('entry_id', photo.entryId)
    .eq('photo_id', photo.id)
    .single()
  if (confirmationError !== null || confirmedPhoto.photo_id !== photo.id) {
    throw new Error('Photo synchronization could not be confirmed')
  }

  await localDb.transaction(
    'rw',
    localDb.photos,
    localDb.photoVariants,
    localDb.syncOperations,
    async () => {
      await localDb.photos.update(photo.id, { syncStatus: 'synced' })
      await localDb.photoVariants
        .where('photoId')
        .equals(photo.id)
        .and((variant) => variant.kind !== 'thumb')
        .delete()
      await localDb.syncOperations.delete(operation.id)
    },
  )
}

async function syncPhotoGpsUpdate(
  operation: PhotoGpsUpdateOperation,
): Promise<void> {
  const photo = await localDb.photos.get(operation.photoId)
  if (photo === undefined) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  if (!isMeaningfulGpsCoordinate(photo.latitude, photo.longitude)) {
    await localDb.syncOperations.delete(operation.id)
    return
  }

  const { error } = await getSupabaseClient()
    .from('photos')
    .update({
      latitude: photo.latitude,
      longitude: photo.longitude,
    })
    .eq('id', photo.id)

  if (error !== null) {
    throw error
  }

  await localDb.syncOperations.delete(operation.id)
}

async function syncPhotoDelete(operation: PhotoDeleteOperation): Promise<void> {
  await deletePhotoOnRemote(operation.photoId)
  await localDb.syncOperations.delete(operation.id)
  await clearDeletedRecord(operation.photoId)
}

async function syncPhotoTagAssign(
  operation: PhotoTagAssignOperation,
): Promise<void> {
  const tag = await assignPhotoTagRemote({
    creatorId: operation.creatorId,
    journeyId: operation.journeyId,
    label: operation.label,
    photoId: operation.photoId,
  })
  await markLocalPhotoTagAssignmentSynced(
    operation.photoId,
    operation.slug,
    tag.id,
  )
  await localDb.syncOperations.delete(operation.id)
}

async function syncPhotoTagRemove(
  operation: PhotoTagRemoveOperation,
): Promise<void> {
  await removePhotoTagRemote({
    creatorId: operation.creatorId,
    journeyId: operation.journeyId,
    photoId: operation.photoId,
    slug: operation.slug,
  })
  await clearLocalPhotoTagAssignment(operation.photoId, operation.slug)
  await localDb.syncOperations.delete(operation.id)
}

async function syncPhotoMetadata(
  client: ReturnType<typeof getSupabaseClient>,
  photo: {
    capturedAt: string | null
    id: string
    latitude: number | null
    longitude: number | null
  },
  creatorId: string,
): Promise<void> {
  const metadata = {
    captured_at: photo.capturedAt,
    creator_id: creatorId,
    id: photo.id,
    latitude: photo.latitude,
    longitude: photo.longitude,
  }
  const { error: insertError } = await client.from('photos').insert(metadata)
  if (insertError === null) {
    return
  }

  if (!isDuplicateInsertError(insertError)) {
    throw insertError
  }

  const { error: updateError } = await client
    .from('photos')
    .update({
      captured_at: photo.capturedAt,
      latitude: photo.latitude,
      longitude: photo.longitude,
    })
    .eq('id', photo.id)
    .eq('creator_id', creatorId)

  if (updateError !== null) {
    throw updateError
  }
}

async function declareAndUploadVariant(
  variant: LocalPhotoVariant,
  creatorId: string,
): Promise<void> {
  const storagePath = `${creatorId}/${variant.photoId}/${variant.kind}.${variant.ext}`
  const client = getSupabaseClient()
  await declarePhotoVariant(client, variant, creatorId, storagePath)
  await uploadPhotoVariantBlob(
    client,
    storagePath,
    variant.blob,
    variant.mimeType,
  )
}

async function uploadPhotoVariantBlob(
  client: ReturnType<typeof getSupabaseClient>,
  storagePath: string,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  const { error: uploadError } = await client.storage
    .from('photos')
    .upload(storagePath, blob, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError === null) {
    return
  }

  const message = uploadError.message.toLowerCase()
  if (!message.includes('duplicate') && !message.includes('already exists')) {
    throw uploadError
  }

  const { error: removeError } = await client.storage
    .from('photos')
    .remove([storagePath])
  if (removeError !== null) {
    throw uploadError
  }

  const { error: retryError } = await client.storage
    .from('photos')
    .upload(storagePath, blob, {
      contentType: mimeType,
      upsert: false,
    })
  if (retryError !== null) {
    throw retryError
  }
}

async function declarePhotoVariant(
  client: ReturnType<typeof getSupabaseClient>,
  variant: LocalPhotoVariant,
  creatorId: string,
  storagePath: string,
): Promise<void> {
  const metadata = {
    byte_size: variant.sizeBytes,
    creator_id: creatorId,
    height: variant.height,
    mime_type: variant.mimeType,
    photo_id: variant.photoId,
    storage_path: storagePath,
    variant: variant.kind,
    width: variant.width,
  }
  const { error: insertError } = await client
    .from('photo_variants')
    .insert(metadata)
  if (insertError === null) {
    return
  }

  if (!isDuplicateInsertError(insertError)) {
    throw insertError
  }

  const { error: updateError } = await client
    .from('photo_variants')
    .update({
      byte_size: variant.sizeBytes,
      height: variant.height,
      width: variant.width,
    })
    .eq('photo_id', variant.photoId)
    .eq('variant', variant.kind)
    .eq('creator_id', creatorId)

  if (updateError !== null) {
    throw updateError
  }
}

function isDuplicateInsertError(error: { message?: string }): boolean {
  return (error.message ?? '').toLowerCase().includes('duplicate')
}
