import {
  mediaQualitySchema,
  type MediaQuality,
} from '@trip-diary/core/automation'
import {
  promoteFoundMedia,
  triageFoundMedia,
} from '@/entities/media/api/media-found.repository'
import {
  type CreateMediaResult,
  MediaUploadError,
  type NewMediaVariant,
  type NewPhotoMedia,
  type NewVideoMedia,
} from '@/entities/media/model/media'
import { mediaTriageState } from '@/entities/media/model/media-triage'
import { mediaStatusSchema } from '@/entities/media/model/media'
import { getSupabaseClient } from '@/shared/api/supabase'

const UNIQUE_VIOLATION = '23505'

/** phash/quality columns, only when both are present and valid. */
function photoAnalysisColumns(input: NewPhotoMedia): {
  phash?: number
  quality?: MediaQuality
} {
  if (input.phash === undefined || input.quality === undefined) return {}
  const quality = mediaQualitySchema.safeParse(input.quality)
  if (!quality.success || !Number.isSafeInteger(input.phash)) return {}
  return { phash: input.phash, quality: quality.data }
}

/** Inserts the media row in status 'uploading' (owner_id must be auth.uid()). */
export async function createMedia(
  input: NewPhotoMedia | NewVideoMedia,
): Promise<void> {
  const video = 'kind' in input
  const analysis = video ? {} : photoAnalysisColumns(input)
  const { error } = await getSupabaseClient()
    .from('media')
    .insert({
      captured_at: input.capturedAt,
      captured_tz: input.capturedTz,
      content_hash: input.contentHash,
      ...(input.device === undefined ? {} : { device: input.device }),
      height: input.height,
      id: input.id,
      kind: video ? 'video' : 'photo',
      ...(input.journeyId === undefined ? {} : { journey_id: input.journeyId }),
      ...(video ? { duration_ms: input.durationMs } : {}),
      latitude: input.latitude,
      longitude: input.longitude,
      owner_id: input.ownerId,
      status: 'uploading',
      width: input.width,
      ...analysis,
      ...(input.sourceAssetId === undefined
        ? {}
        : { source_asset_id: input.sourceAssetId }),
    })
  if (error !== null) {
    throw new MediaUploadError(
      error.code === UNIQUE_VIOLATION ? 'duplicate' : 'create_failed',
      error.message,
      error,
    )
  }
}

const SHA256_HEX = /^[a-f0-9]{64}$/

/**
 * Upload entry point: inserts the media row like createMedia, EXCEPT when the
 * owner already has a row for this (journey, source asset) that came from the
 * triage flow. Then that row is reused (promote_found_media), so the file
 * lands on the row that holds the triage state, not on a colliding new one:
 *   - found, undecided: the user chose to import it now -> keep, then promote
 *   - found, kept/starred: promote
 *   - found, dismissed: not uploaded, MediaUploadError('dismissed') (skipped)
 *   - status 'pending' (an earlier promote whose upload did not finish, e.g.
 *     offline): promote again, the RPC answers already_promoted -> resume
 *   - promote says duplicate (same content hash elsewhere): 'duplicate'
 *   - no row, a row in another journey, or an uploaded one: plain insert, which
 *     keeps today's behaviour (a unique violation is reported as 'duplicate').
 * Resolves with the id to upload into; a reused row keeps its own id and its
 * own metadata (captured time, GPS, phash, moment, star).
 */
export async function createOrPromoteMedia(
  input: NewPhotoMedia | NewVideoMedia,
): Promise<CreateMediaResult> {
  const plain = async (): Promise<CreateMediaResult> => {
    await createMedia(input)
    return { mediaId: input.id, reusedFoundRow: false }
  }
  if (input.journeyId === undefined || input.sourceAssetId === undefined) {
    return plain()
  }
  const { data, error } = await getSupabaseClient()
    .from('media')
    .select('id, status, journey_id, reviewed_at, deleted_at, starred')
    .eq('owner_id', input.ownerId)
    .eq('source_asset_id', input.sourceAssetId)
    .maybeSingle()
  if (error !== null) {
    throw new MediaUploadError('create_failed', error.message, error)
  }
  const status = mediaStatusSchema.safeParse(data?.status)
  if (data === null || !status.success || data.journey_id !== input.journeyId) {
    return plain()
  }
  const state = mediaTriageState({
    deletedAt: data.deleted_at,
    reviewedAt: data.reviewed_at,
    starred: data.starred,
    status: status.data,
  })
  if (state === 'dismissed') {
    throw new MediaUploadError('dismissed', 'dismissed before upload')
  }
  const resumes = state === 'uploaded' && status.data === 'pending'
  if (state === 'uploaded' && !resumes) return plain()
  try {
    if (state === 'found') await triageFoundMedia([data.id], 'keep')
    const hash = input.contentHash
    const [result] = await promoteFoundMedia([
      {
        id: data.id,
        ...(hash !== null && SHA256_HEX.test(hash)
          ? { contentHash: hash }
          : {}),
      },
    ])
    if (result?.outcome === 'duplicate') {
      throw new MediaUploadError('duplicate', 'same content already uploaded')
    }
    if (result === undefined || result.outcome === 'not_kept') {
      // Dismissed in between (another device): do not upload.
      throw new MediaUploadError('dismissed', 'no longer kept')
    }
    return { mediaId: data.id, reusedFoundRow: true }
  } catch (cause) {
    if (cause instanceof MediaUploadError) throw cause
    throw new MediaUploadError(
      'create_failed',
      cause instanceof Error ? cause.message : undefined,
      cause,
    )
  }
}

/** Inserts a variant row; storage_key must be the key the edge function returned. */
export async function addVariant(input: NewMediaVariant): Promise<void> {
  const { error } = await getSupabaseClient().from('media_variants').insert({
    byte_size: input.byteSize,
    height: input.height,
    kind: input.kind,
    media_id: input.mediaId,
    mime_type: input.mimeType,
    storage_key: input.storageKey,
    width: input.width,
  })
  if (error !== null) {
    throw new MediaUploadError('variant_failed', error.message, error)
  }
}

async function setStatus(
  mediaId: string,
  status: 'failed' | 'ready',
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('media')
    .update({ status })
    .eq('id', mediaId)
  if (error !== null) {
    throw new MediaUploadError('finalize_failed', error.message, error)
  }
}

export function markMediaReady(mediaId: string): Promise<void> {
  return setStatus(mediaId, 'ready')
}

export function markMediaFailed(mediaId: string): Promise<void> {
  return setStatus(mediaId, 'failed')
}

/** Deletes the media row (variant rows cascade); owners may delete their media. */
export async function deleteMedia(mediaId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('media')
    .delete()
    .eq('id', mediaId)
  if (error !== null) {
    throw new MediaUploadError('finalize_failed', error.message, error)
  }
}

const SOURCE_ID_BATCH = 100

/**
 * Which of `sourceIds` already exist as an uploaded media.source_asset_id for
 * this owner (found rows excluded, see below).
 * Batched `in` queries (ids are short strings; 100 per request keeps URLs small).
 */
export async function listExistingSourceAssetIds(
  ownerId: string,
  sourceIds: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  for (let start = 0; start < sourceIds.length; start += SOURCE_ID_BATCH) {
    const batch = sourceIds.slice(start, start + SOURCE_ID_BATCH)
    const { data, error } = await getSupabaseClient()
      .from('media')
      .select('source_asset_id, status')
      .eq('owner_id', ownerId)
      .in('source_asset_id', batch)
    if (error !== null) {
      throw new MediaUploadError('create_failed', error.message, error)
    }
    for (const row of data) {
      // Found rows are NOT "already imported": a kept one still has to be
      // uploaded (createOrPromoteMedia reuses it); a dismissed one is skipped
      // there with the reason 'dismissed'.
      if (row.status === 'found') continue
      if (row.source_asset_id !== null) found.add(row.source_asset_id)
    }
  }
  return found
}
