import {
  entrySchema,
  updateEntrySchema,
  type Entry,
  type UpdateEntryInput,
} from '@/entities/entry/model/entry'
import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import {
  clearDeletedRecord,
  isRecordDeleted,
  markDeletedRecord,
} from '@/shared/lib/local-deleted-records'
import { isBrowserOnline } from '@/shared/lib/network'
import { createPublicSlug } from '@/shared/lib/slug'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function updateEntry(
  entryId: string,
  creatorId: string,
  input: UpdateEntryInput,
): Promise<Entry> {
  const entry = await resolveEditableEntry(entryId, creatorId)
  if (await isRecordDeleted('entry', entryId)) {
    throw new Error('Entry is unavailable')
  }

  if (!isBrowserOnline()) {
    return updateLocalEntryRecord(entryId, input)
  }

  try {
    const updated = await updateEntryOnRemote(entry, input)
    await localDb.entries.put(updated)
    return updated
  } catch {
    return updateLocalEntryRecord(entryId, input)
  }
}

export async function deleteEntry(
  entryId: string,
  creatorId: string,
): Promise<void> {
  const entry = await resolveEditableEntry(entryId, creatorId)
  if (await isRecordDeleted('entry', entryId)) {
    return
  }

  if (entry.syncStatus === 'pending') {
    await purgeLocalEntryArtifacts(entryId)
    return
  }

  if (!isBrowserOnline()) {
    await queueEntryDelete(entry)
    return
  }

  try {
    await deleteEntryOnRemote(entryId)
    await purgeLocalEntryArtifacts(entryId)
    await clearDeletedRecord(entryId)
  } catch {
    await queueEntryDelete(entry)
  }
}

async function resolveEditableEntry(
  entryId: string,
  creatorId: string,
): Promise<Entry> {
  let entry = await getLocalEntry(entryId)
  if (entry === null) {
    if (!isBrowserOnline()) {
      throw new Error('Entry is unavailable offline')
    }
    entry = await getPublicEntry(entryId)
    if (entry === null) {
      throw new Error('Entry not found')
    }
    await localDb.entries.put(entry)
  }

  if (entry.creatorId !== creatorId) {
    throw new Error('Entry is unavailable')
  }

  return entry
}

async function updateLocalEntryRecord(
  entryId: string,
  input: UpdateEntryInput,
): Promise<Entry> {
  const validInput = updateEntrySchema.parse(input)
  const entry = await getLocalEntry(entryId)
  if (entry === null) {
    throw new Error('Entry not found')
  }

  const now = new Date().toISOString()
  const updated = entrySchema.parse({
    ...entry,
    ...validInput,
    slug: createPublicSlug(validInput.title, entry.id),
    syncStatus: entry.syncStatus === 'synced' ? 'pending' : entry.syncStatus,
    updatedAt: now,
  })
  const needsUpdateOperation =
    entry.syncStatus === 'synced' || entry.syncStatus === 'failed'

  await localDb.transaction(
    'rw',
    localDb.entries,
    localDb.syncOperations,
    async () => {
      await localDb.entries.put(updated)
      if (!needsUpdateOperation) {
        return
      }

      await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'entry.update' && operation.entryId === entryId,
        )
        .delete()
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId: entry.creatorId,
          entryId,
          expectedVersion: entry.version,
          id: crypto.randomUUID(),
          status: 'pending',
          type: 'entry.update',
        }),
      )
    },
  )

  return updated
}

async function queueEntryDelete(entry: Entry): Promise<void> {
  const now = new Date().toISOString()
  const photoIds = (
    await localDb.photos.where('entryId').equals(entry.id).toArray()
  ).map((photo) => photo.id)

  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.entries,
    localDb.journeyLinks,
    localDb.photos,
    async () => {
      await markDeletedRecord({
        creatorId: entry.creatorId,
        deletedAt: now,
        id: entry.id,
        kind: 'entry',
      })
      await localDb.entries.delete(entry.id)
      await localDb.journeyLinks.delete(entry.id)
      await localDb.photos.where('entryId').equals(entry.id).delete()
    },
  )
  await localDb.transaction('rw', localDb.photoVariants, async () => {
    if (photoIds.length > 0) {
      await localDb.photoVariants.where('photoId').anyOf(photoIds).delete()
    }
  })
  await localDb.transaction('rw', localDb.syncOperations, async () => {
    await purgePhotoUploadSyncOperations(photoIds)
    await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'entry.update' && operation.entryId === entry.id,
      )
      .delete()
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: now,
        creatorId: entry.creatorId,
        entryId: entry.id,
        id: crypto.randomUUID(),
        status: 'pending',
        type: 'entry.delete',
      }),
    )
  })
}

async function purgeLocalEntryArtifacts(entryId: string): Promise<void> {
  const photoIds = (
    await localDb.photos.where('entryId').equals(entryId).toArray()
  ).map((photo) => photo.id)

  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.entries,
    localDb.journeyLinks,
    localDb.photos,
    async () => {
      await localDb.deletedRecords.delete(entryId)
      await localDb.entries.delete(entryId)
      await localDb.journeyLinks.delete(entryId)
      await localDb.photos.where('entryId').equals(entryId).delete()
    },
  )
  await localDb.transaction('rw', localDb.photoVariants, async () => {
    if (photoIds.length > 0) {
      await localDb.photoVariants.where('photoId').anyOf(photoIds).delete()
    }
  })
  await localDb.transaction('rw', localDb.syncOperations, async () => {
    await purgePhotoUploadSyncOperations(photoIds)
    await localDb.syncOperations
      .filter((operation) => operationMatchesEntry(operation, entryId))
      .delete()
  })
}

async function purgePhotoUploadSyncOperations(
  photoIds: string[],
): Promise<void> {
  if (photoIds.length === 0) {
    return
  }

  await localDb.syncOperations
    .filter(
      (operation) =>
        operation.type === 'photo.upload' &&
        photoIds.includes(operation.photoId),
    )
    .delete()
}

function operationMatchesEntry(
  operation: { type: string } & Record<string, unknown>,
  entryId: string,
): boolean {
  if ('entryId' in operation && operation.entryId === entryId) {
    return true
  }
  return false
}

async function updateEntryOnRemote(
  entry: Entry,
  input: UpdateEntryInput,
): Promise<Entry> {
  const validInput = updateEntrySchema.parse(input)
  const { data, error } = await getSupabaseClient().rpc('update_entry', {
    p_body: validInput.body,
    p_event_at: validInput.eventAt,
    p_expected_version: entry.version,
    p_id: entry.id,
    p_language: validInput.language,
    p_latitude: null,
    p_longitude: null,
    p_status: entry.status,
    p_title: validInput.title,
    p_type: validInput.type,
    p_visibility: validInput.visibility,
  })

  if (error !== null) {
    throw error
  }

  const row = data?.[0]
  if (row === undefined) {
    throw new Error('Entry update could not be confirmed')
  }

  return entrySchema.parse({
    body: row.body,
    createdAt: row.created_at,
    creatorId: row.creator_id,
    eventAt: row.event_at,
    id: row.id,
    language: row.language,
    publishedAt: row.published_at,
    slug: row.slug,
    spaceId: row.space_id,
    status: row.status,
    syncStatus: 'synced',
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at,
    version: row.version,
    visibility: row.visibility,
  })
}

async function deleteEntryOnRemote(entryId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('entries')
    .delete()
    .eq('id', entryId)

  if (error !== null) {
    throw error
  }
}
