import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import type { LocalPhotoVariant } from '@/entities/photo/model/photo'
import { listMySpaces } from '@/entities/space/api/space.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { createPublicSlug } from '@/shared/lib/slug'
import type { SyncOperation } from '@/shared/sync/sync-operation'

export async function syncPendingOperations(): Promise<void> {
  const { data } = await getSupabaseClient().auth.getUser()
  const creatorId = data.user?.id

  if (creatorId === undefined) {
    return
  }

  const operations = await localDb.syncOperations
    .where('status')
    .anyOf(['pending', 'failed'])
    .filter((operation) => operation.creatorId === creatorId)
    .sortBy('createdAt')

  for (const operation of operations) {
    await localDb.syncOperations.update(operation.id, { status: 'syncing' })

    try {
      switch (operation.type) {
        case 'entry.create':
          await syncEntryCreate(operation, creatorId)
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
      } else {
        await localDb.photos.update(operation.photoId, { syncStatus: 'failed' })
      }
      throw toSyncError(error)
    }
  }
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
