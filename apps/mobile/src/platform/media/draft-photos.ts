import * as FileSystem from 'expo-file-system'
import type {
  PickedPhoto,
  PickedPhotoDiagnostics,
  PhotoMimeType,
} from '@/platform/media/photo'
import { getMobileDatabase } from '@/platform/storage/database'

export type MomentDraftPhotoStatus =
  | 'ready'
  | 'failed'
  | 'enqueued'
  | 'removed'

/** Untracked files older than this may be deleted at startup. */
export const ORPHAN_PHOTO_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function buildMomentDraftKey(input: {
  entryId?: string | null
  journeyId: string
  mode: 'create' | 'edit'
}): string {
  if (
    input.entryId !== null &&
    input.entryId !== undefined &&
    input.entryId.length > 0
  ) {
    return `entry:${input.entryId}`
  }

  return `journey:${input.journeyId}:new`
}

export interface MomentDraftPhotoRow {
  byteSize: number | null
  capturedAt: string | null
  diagnostics: PickedPhotoDiagnostics
  draftKey: string
  entryId: string | null
  height: number
  id: string
  isCover: boolean
  journeyId: string
  latitude: number | null
  localUri: string
  longitude: number | null
  mimeType: PhotoMimeType
  position: number
  status: MomentDraftPhotoStatus
  smallUri: string | null
  thumbUri: string | null
  width: number
}

export async function upsertMomentDraftPhoto(input: {
  draftKey: string
  entryId?: string | null
  isCover?: boolean
  journeyId: string
  photo: PickedPhoto
  position?: number
}): Promise<void> {
  const db = await getMobileDatabase()
  const now = new Date().toISOString()
  const status: MomentDraftPhotoStatus =
    input.photo.status === 'ready' ? 'ready' : 'failed'

  await db.runAsync(
    `INSERT INTO moment_draft_photos (
       id, draft_key, journey_id, entry_id, status, local_uri, thumb_uri, small_uri,
       mime_type, width, height, byte_size, captured_at, latitude, longitude,
       is_cover, position, diagnostics, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       draft_key = excluded.draft_key,
       journey_id = excluded.journey_id,
       entry_id = COALESCE(excluded.entry_id, moment_draft_photos.entry_id),
       status = excluded.status,
       local_uri = excluded.local_uri,
       thumb_uri = excluded.thumb_uri,
       small_uri = excluded.small_uri,
       mime_type = excluded.mime_type,
       width = excluded.width,
       height = excluded.height,
       byte_size = excluded.byte_size,
       captured_at = excluded.captured_at,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       is_cover = excluded.is_cover,
       position = excluded.position,
       diagnostics = excluded.diagnostics,
       updated_at = excluded.updated_at`,
    input.photo.localId,
    input.draftKey,
    input.journeyId,
    input.entryId ?? null,
    status,
    input.photo.uri,
    input.photo.thumbUri,
    input.photo.smallUri,
    input.photo.mimeType,
    input.photo.width,
    input.photo.height,
    input.photo.diagnostics.normalizedByteSize ??
      input.photo.diagnostics.originalByteSize,
    input.photo.metadata.capturedAt,
    input.photo.metadata.latitude,
    input.photo.metadata.longitude,
    input.isCover === true ? 1 : 0,
    input.position ?? 0,
    JSON.stringify(input.photo.diagnostics),
    now,
    now,
  )
}

export async function listMomentDraftPhotos(
  draftKey: string,
): Promise<MomentDraftPhotoRow[]> {
  const db = await getMobileDatabase()
  const rows = await db.getAllAsync<{
    byte_size: number | null
    captured_at: string | null
    diagnostics: string
    draft_key: string
    entry_id: string | null
    height: number
    id: string
    is_cover: number
    journey_id: string
    latitude: number | null
    local_uri: string
    longitude: number | null
    mime_type: string
    position: number
    status: string
    small_uri: string | null
    thumb_uri: string | null
    width: number
  }>(
    `SELECT *
     FROM moment_draft_photos
     WHERE draft_key = ?
       AND status IN ('ready', 'failed', 'enqueued')
     ORDER BY position ASC, created_at ASC`,
    draftKey,
  )

  return rows.map(mapRow)
}

export async function listActiveMomentDraftPhotos(
  draftKey: string,
): Promise<MomentDraftPhotoRow[]> {
  const rows = await listMomentDraftPhotos(draftKey)
  return rows.filter((row) => row.status === 'ready' || row.status === 'failed')
}

export function draftPhotoToPickedPhoto(row: MomentDraftPhotoRow): PickedPhoto {
  const ready = row.status === 'ready' && row.localUri.trim().length > 0

  return {
    diagnostics: row.diagnostics,
    height: row.height,
    localId: row.id,
    metadata: {
      capturedAt: row.capturedAt,
      latitude: row.latitude,
      localUri: row.localUri,
      longitude: row.longitude,
    },
    mimeType: row.mimeType,
    status: ready ? 'ready' : 'failed',
    smallUri: row.smallUri,
    thumbUri: row.thumbUri,
    uri: ready ? row.localUri : '',
    width: row.width,
  }
}

/**
 * Explicit user remove — deletes durable record and local files.
 * Idempotent if already gone.
 */
export async function removeMomentDraftPhoto(photoId: string): Promise<void> {
  const db = await getMobileDatabase()
  const row = await db.getFirstAsync<{
    local_uri: string
    small_uri: string | null
    thumb_uri: string | null
  }>(
    `SELECT local_uri, thumb_uri, small_uri FROM moment_draft_photos WHERE id = ?`,
    photoId,
  )

  await db.runAsync(`DELETE FROM moment_draft_photos WHERE id = ?`, photoId)

  if (row === null) {
    return
  }

  await deleteLocalFiles([row.local_uri, row.thumb_uri, row.small_uri])
}

export async function setMomentDraftCoverPhoto(
  draftKey: string,
  photoId: string,
): Promise<void> {
  const db = await getMobileDatabase()
  const now = new Date().toISOString()
  await db.runAsync(
    `UPDATE moment_draft_photos SET is_cover = 0, updated_at = ? WHERE draft_key = ?`,
    now,
    draftKey,
  )
  await db.runAsync(
    `UPDATE moment_draft_photos SET is_cover = 1, updated_at = ? WHERE id = ? AND draft_key = ?`,
    now,
    photoId,
    draftKey,
  )
}

export async function markMomentDraftPhotoEnqueued(input: {
  entryId: string
  photoId: string
}): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    `UPDATE moment_draft_photos
     SET status = 'enqueued', entry_id = ?, updated_at = ?
     WHERE id = ?`,
    input.entryId,
    new Date().toISOString(),
    input.photoId,
  )
}

export async function clearEnqueuedMomentDraftPhotos(
  draftKey: string,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    `DELETE FROM moment_draft_photos
     WHERE draft_key = ?
       AND status = 'enqueued'`,
    draftKey,
  )
}

export async function clearMomentDraft(draftKey: string): Promise<void> {
  const db = await getMobileDatabase()
  const rows = await db.getAllAsync<{
    local_uri: string
    small_uri: string | null
    thumb_uri: string | null
  }>(
    `SELECT local_uri, thumb_uri, small_uri FROM moment_draft_photos WHERE draft_key = ?`,
    draftKey,
  )
  await db.runAsync(
    `DELETE FROM moment_draft_photos WHERE draft_key = ?`,
    draftKey,
  )
  for (const row of rows) {
    await deleteLocalFiles([row.local_uri, row.thumb_uri, row.small_uri])
  }
}

/**
 * Rebinds draft photos to a stable entry id (create → saved Moment).
 * Idempotent when from and to keys match — still stamps entry_id.
 */
export async function bindMomentDraftPhotosToEntry(input: {
  entryId: string
  fromDraftKey: string
  toDraftKey: string
}): Promise<void> {
  const db = await getMobileDatabase()
  const now = new Date().toISOString()

  if (input.fromDraftKey === input.toDraftKey) {
    await db.runAsync(
      `UPDATE moment_draft_photos
       SET entry_id = ?, updated_at = ?
       WHERE draft_key = ?`,
      input.entryId,
      now,
      input.toDraftKey,
    )
    return
  }

  await db.runAsync(
    `UPDATE moment_draft_photos
     SET draft_key = ?, entry_id = ?, updated_at = ?
     WHERE draft_key = ?`,
    input.toDraftKey,
    input.entryId,
    now,
    input.fromDraftKey,
  )
}

export async function listTrackedLocalPhotoUris(): Promise<Set<string>> {
  const db = await getMobileDatabase()
  const tracked = new Set<string>()

  const draftRows = await db.getAllAsync<{
    local_uri: string
    small_uri: string | null
    thumb_uri: string | null
  }>(`SELECT local_uri, thumb_uri, small_uri FROM moment_draft_photos`)

  for (const row of draftRows) {
    if (row.local_uri.trim().length > 0) {
      tracked.add(row.local_uri)
    }
    if (row.thumb_uri !== null && row.thumb_uri.trim().length > 0) {
      tracked.add(row.thumb_uri)
    }
    if (row.small_uri !== null && row.small_uri.trim().length > 0) {
      tracked.add(row.small_uri)
    }
  }

  const queueRows = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM sync_queue
     WHERE operation_type = 'photo.upload'
       AND status IN ('pending', 'processing', 'failed')`,
  )

  for (const row of queueRows) {
    try {
      const payload = JSON.parse(row.payload) as {
        localUri?: unknown
        smallLocalUri?: unknown
        thumbLocalUri?: unknown
      }
      if (typeof payload.localUri === 'string' && payload.localUri.length > 0) {
        tracked.add(payload.localUri)
      }
      if (
        typeof payload.smallLocalUri === 'string' &&
        payload.smallLocalUri.length > 0
      ) {
        tracked.add(payload.smallLocalUri)
      }
      if (
        typeof payload.thumbLocalUri === 'string' &&
        payload.thumbLocalUri.length > 0
      ) {
        tracked.add(payload.thumbLocalUri)
      }
    } catch {
      continue
    }
  }

  return tracked
}

/**
 * Deletes untracked files under documents/photos older than the age threshold.
 * Never deletes URIs referenced by draft rows or active sync_queue payloads.
 */
export async function reconcileOrphanPhotoFiles(
  options: { maxAgeMs?: number; nowMs?: number } = {},
): Promise<{ deletedCount: number; skippedTracked: number }> {
  const maxAgeMs = options.maxAgeMs ?? ORPHAN_PHOTO_FILE_MAX_AGE_MS
  const nowMs = options.nowMs ?? Date.now()
  const documentDirectory = FileSystem.documentDirectory
  if (documentDirectory === null) {
    return { deletedCount: 0, skippedTracked: 0 }
  }

  const photosDir = `${documentDirectory}photos`
  const dirInfo = await FileSystem.getInfoAsync(photosDir)
  if (!dirInfo.exists) {
    return { deletedCount: 0, skippedTracked: 0 }
  }

  const tracked = await listTrackedLocalPhotoUris()
  const names = await FileSystem.readDirectoryAsync(photosDir)
  let deletedCount = 0
  let skippedTracked = 0

  for (const name of names) {
    if (name.startsWith('staging-')) {
      // Staging copies should be short-lived; clean if stale.
    }

    const uri = `${photosDir}/${name}`
    if (tracked.has(uri)) {
      skippedTracked += 1
      continue
    }

    const info = await FileSystem.getInfoAsync(uri, { size: true })
    if (!info.exists || info.isDirectory) {
      continue
    }

    const modifiedMs =
      'modificationTime' in info && typeof info.modificationTime === 'number'
        ? info.modificationTime * 1000
        : null

    if (modifiedMs !== null && nowMs - modifiedMs < maxAgeMs) {
      continue
    }

    // If modificationTime is unavailable, only delete clearly stale staging files.
    if (modifiedMs === null && !name.startsWith('staging-')) {
      continue
    }

    try {
      await FileSystem.deleteAsync(uri, { idempotent: true })
      deletedCount += 1
    } catch {
      // Best-effort.
    }
  }

  return { deletedCount, skippedTracked }
}

async function deleteLocalFiles(
  uris: Array<string | null | undefined>,
): Promise<void> {
  for (const uri of uris) {
    if (uri === null || uri === undefined || uri.trim().length === 0) {
      continue
    }
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true })
    } catch {
      // Best-effort.
    }
  }
}

function mapRow(row: {
  byte_size: number | null
  captured_at: string | null
  diagnostics: string
  draft_key: string
  entry_id: string | null
  height: number
  id: string
  is_cover: number
  journey_id: string
  latitude: number | null
  local_uri: string
  longitude: number | null
  mime_type: string
  position: number
  status: string
  small_uri: string | null
  thumb_uri: string | null
  width: number
}): MomentDraftPhotoRow {
  let diagnostics: PickedPhotoDiagnostics
  try {
    diagnostics = JSON.parse(row.diagnostics) as PickedPhotoDiagnostics
  } catch {
    diagnostics = {
      attemptCount: 1,
      declaredMime: null,
      failedStage: row.status === 'failed' ? 'validate' : null,
      lastError:
        row.status === 'failed'
          ? 'Previously failed materialization; re-select the photo.'
          : null,
      normalizedByteSize: row.byte_size,
      normalizedHeight: row.height,
      normalizedWidth: row.width,
      originalByteSize: row.byte_size,
      sourceHeight: row.height,
      sourceUriScheme: 'file',
      sourceWidth: row.width,
    }
  }

  // After restart, failed items without durable bytes cannot retry source URIs.
  if (row.status === 'failed' && row.local_uri.trim().length === 0) {
    diagnostics = {
      ...diagnostics,
      failedStage: diagnostics.failedStage ?? 'copy',
      lastError:
        diagnostics.lastError ??
        'Photo was never materialized into app storage. Please select it again.',
    }
  }

  const mimeType: PhotoMimeType =
    row.mime_type === 'image/webp' ? 'image/webp' : 'image/jpeg'

  return {
    byteSize: row.byte_size,
    capturedAt: row.captured_at,
    diagnostics,
    draftKey: row.draft_key,
    entryId: row.entry_id,
    height: row.height,
    id: row.id,
    isCover: row.is_cover === 1,
    journeyId: row.journey_id,
    latitude: row.latitude,
    localUri: row.local_uri,
    longitude: row.longitude,
    mimeType,
    position: row.position,
    status: row.status as MomentDraftPhotoStatus,
    smallUri: row.small_uri ?? null,
    thumbUri: row.thumb_uri,
    width: row.width,
  }
}
