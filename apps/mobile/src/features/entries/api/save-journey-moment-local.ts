import { createPublicSlug } from '@trip-diary/utils'
import {
  createEntryId,
  createStopId,
  type CreateJourneyMomentInput,
} from '@/features/entries/api/entries.repository'
import {
  bindMomentDraftPhotosToEntry,
  buildMomentDraftKey,
} from '@/platform/media/draft-photos'
import {
  entryCreateOperationId,
  entryUpdateOperationId,
  ENTRY_CREATE_OPERATION,
  ENTRY_UPDATE_OPERATION,
} from '@/platform/sync/entry-sync'
import { enqueueSyncOperationForApp } from '@/platform/sync/enqueue-operation'
import { getSyncOperation } from '@/platform/sync/queue'
import {
  getLocalMoment,
  upsertLocalMoment,
  type LocalMomentRecord,
} from '@/platform/storage/local-moments'
import { getMobileDatabase } from '@/platform/storage/database'

export async function saveJourneyMomentLocally(
  input: CreateJourneyMomentInput & {
    /** Pre-allocated id for create; required for edit. */
    entryId: string
    mode: 'create' | 'edit'
    userId: string
  },
): Promise<{ entryId: string; stopId: string | null }> {
  const now = new Date().toISOString()
  const hasLocation =
    input.latitude !== null &&
    input.longitude !== null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)

  const existing = await getLocalMoment(input.entryId)
  const stopId = hasLocation
    ? (input.stopId ?? existing?.stopId ?? createStopId())
    : (input.stopId ?? existing?.stopId ?? null)

  const createdAt = existing?.createdAt ?? now
  const slug =
    existing?.slug ?? createPublicSlug(input.title.trim(), input.entryId)

  const record: LocalMomentRecord = {
    body: input.body,
    createdAt,
    creatorId: input.creatorId,
    eventAt: input.eventAt,
    id: input.entryId,
    journeyId: input.journeyId,
    language: input.language,
    latitude: hasLocation ? input.latitude : null,
    locationTitle: input.locationTitle,
    longitude: hasLocation ? input.longitude : null,
    slug,
    spaceId: input.spaceId,
    stageId: input.stageId,
    stopId,
    syncStatus: 'pending',
    title: input.title.trim(),
    type: input.type,
    updatedAt: now,
    visibility: input.visibility,
  }

  await upsertLocalMoment(record)

  // Ensure draft photos for this Moment use the stable entry draft key.
  const createDraftKey = buildMomentDraftKey({
    journeyId: input.journeyId,
    mode: 'create',
  })
  const entryDraftKey = buildMomentDraftKey({
    entryId: input.entryId,
    journeyId: input.journeyId,
    mode: 'edit',
  })
  if (createDraftKey !== entryDraftKey) {
    await bindMomentDraftPhotosToEntry({
      entryId: input.entryId,
      fromDraftKey: createDraftKey,
      toDraftKey: entryDraftKey,
    })
  }
  await bindMomentDraftPhotosToEntry({
    entryId: input.entryId,
    fromDraftKey: entryDraftKey,
    toDraftKey: entryDraftKey,
  })

  if (input.mode === 'create') {
    await enqueueEntryCreateIfNeeded({
      record,
      userId: input.userId,
    })
  } else {
    await enqueueEntryUpdateIfNeeded({
      record,
      userId: input.userId,
    })
  }

  return { entryId: input.entryId, stopId }
}

async function enqueueEntryCreateIfNeeded(input: {
  record: LocalMomentRecord
  userId: string
}): Promise<void> {
  const operationId = entryCreateOperationId(input.record.id)
  const existing = await getSyncOperation(operationId)
  if (
    existing !== null &&
    (existing.status === 'pending' ||
      existing.status === 'processing' ||
      existing.status === 'synced')
  ) {
    return
  }

  if (existing !== null && existing.status === 'failed') {
    const db = await getMobileDatabase()
    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, operationId)
  }

  await enqueueSyncOperationForApp({
    id: operationId,
    operationType: ENTRY_CREATE_OPERATION,
    payload: {
      body: input.record.body,
      createdAt: input.record.createdAt,
      creatorId: input.record.creatorId,
      entryId: input.record.id,
      eventAt: input.record.eventAt,
      journeyId: input.record.journeyId,
      language: input.record.language,
      latitude: input.record.latitude,
      locationTitle: input.record.locationTitle,
      longitude: input.record.longitude,
      slug: input.record.slug,
      spaceId: input.record.spaceId,
      stageId: input.record.stageId,
      stopId: input.record.stopId,
      title: input.record.title,
      type: input.record.type,
      visibility: input.record.visibility,
    },
    userId: input.userId,
  })
}

async function enqueueEntryUpdateIfNeeded(input: {
  record: LocalMomentRecord
  userId: string
}): Promise<void> {
  // If create is still unfinished, local upsert is enough — create will push
  // the latest local_moments row when it runs.
  const createOp = await getSyncOperation(entryCreateOperationId(input.record.id))
  if (
    createOp !== null &&
    (createOp.status === 'pending' ||
      createOp.status === 'processing' ||
      createOp.status === 'failed')
  ) {
    return
  }

  const operationId = entryUpdateOperationId(input.record.id)
  const existing = await getSyncOperation(operationId)
  if (
    existing !== null &&
    (existing.status === 'pending' || existing.status === 'processing')
  ) {
    // Replace payload with latest content by delete + re-enqueue.
    const db = await getMobileDatabase()
    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, operationId)
  } else if (existing !== null && existing.status === 'failed') {
    const db = await getMobileDatabase()
    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, operationId)
  } else if (existing !== null && existing.status === 'synced') {
    const db = await getMobileDatabase()
    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, operationId)
  }

  await enqueueSyncOperationForApp({
    id: operationId,
    operationType: ENTRY_UPDATE_OPERATION,
    payload: {
      entryId: input.record.id,
      journeyId: input.record.journeyId,
    },
    userId: input.userId,
  })
}

export { createEntryId }
