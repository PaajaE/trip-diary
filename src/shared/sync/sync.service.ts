import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getLocalJourney } from '@/entities/journey/api/local-journey.repository'
import type { LocalPhotoVariant } from '@/entities/photo/model/photo'
import { listMySpaces } from '@/entities/space/api/space.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { createPublicSlug } from '@/shared/lib/slug'
import type { SyncOperation } from '@/shared/sync/sync-operation'

export const STALE_SYNCING_OPERATION_MS = 5 * 60 * 1000

export async function syncPendingOperations(): Promise<void> {
  const { data } = await getSupabaseClient().auth.getUser()
  const creatorId = data.user?.id

  if (creatorId === undefined) {
    return
  }

  await recoverStaleSyncingOperations(creatorId)

  const operations = await localDb.syncOperations
    .where('status')
    .anyOf(['pending', 'failed'])
    .filter((operation) => operation.creatorId === creatorId)
    .sortBy('createdAt')

  const errors: Error[] = []
  for (const operation of operations) {
    if (await hasUnfinishedDependency(operation)) {
      continue
    }

    await localDb.syncOperations.update(operation.id, {
      lastAttemptAt: new Date().toISOString(),
      status: 'syncing',
    })

    try {
      switch (operation.type) {
        case 'entry.create':
          await syncEntryCreate(operation, creatorId)
          break
        case 'journey.create':
          await syncJourneyCreate(operation)
          break
        case 'journey.assignment.upsert':
          await syncJourneyAssignment(operation)
          break
        case 'photo.upload':
          await syncPhotoUpload(operation, creatorId)
          break
      }
    } catch (error) {
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
      }
      errors.push(toSyncError(error))
    }
  }

  const firstError = errors[0]
  if (firstError !== undefined) {
    throw firstError
  }
}

async function recoverStaleSyncingOperations(creatorId: string): Promise<void> {
  const staleBefore = Date.now() - STALE_SYNCING_OPERATION_MS
  await localDb.syncOperations
    .where('status')
    .equals('syncing')
    .filter(
      (operation) =>
        operation.creatorId === creatorId &&
        (operation.lastAttemptAt === undefined ||
          new Date(operation.lastAttemptAt).valueOf() <= staleBefore),
    )
    .modify({ status: 'pending' })
}

async function hasUnfinishedDependency(
  operation: SyncOperation,
): Promise<boolean> {
  if (operation.type === 'journey.assignment.upsert') {
    const pendingEntryCreate =
      (await localDb.syncOperations
        .filter(
          (candidate) =>
            candidate.type === 'entry.create' &&
            candidate.entryId === operation.entryId,
        )
        .count()) > 0
    if (pendingEntryCreate) {
      return true
    }

    return (
      (await localDb.syncOperations
        .filter(
          (candidate) =>
            candidate.type === 'journey.create' &&
            candidate.journeyId === operation.journeyId,
        )
        .count()) > 0
    )
  }

  return false
}

function toSyncError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return new Error(error.message)
  }
  return new Error('Synchronization failed')
}

type EntryCreateOperation = Extract<SyncOperation, { type: 'entry.create' }>
type JourneyCreateOperation = Extract<SyncOperation, { type: 'journey.create' }>
type JourneyAssignmentOperation = Extract<
  SyncOperation,
  { type: 'journey.assignment.upsert' }
>
type PhotoUploadOperation = Extract<SyncOperation, { type: 'photo.upload' }>

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

  const { error } = await getSupabaseClient().from('entries').upsert(
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

  if (error !== null) {
    throw error
  }

  const { data: serverEntry, error: confirmationError } =
    await getSupabaseClient()
      .from('entries')
      .select('creator_id, published_at, status, updated_at, version')
      .eq('id', entry.id)
      .single()

  if (
    confirmationError !== null ||
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

  await localDb.photos.update(photo.id, { syncStatus: 'syncing' })
  const client = getSupabaseClient()
  const { error: photoError } = await client.from('photos').upsert(
    {
      captured_at: photo.capturedAt,
      creator_id: creatorId,
      id: photo.id,
    },
    { ignoreDuplicates: true, onConflict: 'id' },
  )
  if (photoError !== null) {
    throw photoError
  }

  for (const variant of variants) {
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

async function declareAndUploadVariant(
  variant: LocalPhotoVariant,
  creatorId: string,
): Promise<void> {
  const storagePath = `${creatorId}/${variant.photoId}/${variant.kind}.webp`
  const client = getSupabaseClient()
  const { error: declarationError } = await client
    .from('photo_variants')
    .upsert(
      {
        byte_size: variant.sizeBytes,
        creator_id: creatorId,
        height: variant.height,
        mime_type: 'image/webp',
        photo_id: variant.photoId,
        storage_path: storagePath,
        variant: variant.kind,
        width: variant.width,
      },
      { ignoreDuplicates: true, onConflict: 'photo_id,variant' },
    )
  if (declarationError !== null) {
    throw declarationError
  }

  const { error: uploadError } = await client.storage
    .from('photos')
    .upload(storagePath, variant.blob, {
      contentType: 'image/webp',
      upsert: false,
    })
  if (
    uploadError !== null &&
    !uploadError.message.toLowerCase().includes('duplicate')
  ) {
    throw uploadError
  }
}
