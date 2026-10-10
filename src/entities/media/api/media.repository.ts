import {
  MediaUploadError,
  type NewMediaVariant,
  type NewPhotoMedia,
  type NewVideoMedia,
} from '@/entities/media/model/media'
import { getSupabaseClient } from '@/shared/api/supabase'

const UNIQUE_VIOLATION = '23505'

/** Inserts the media row in status 'uploading' (owner_id must be auth.uid()). */
export async function createMedia(
  input: NewPhotoMedia | NewVideoMedia,
): Promise<void> {
  const video = 'kind' in input
  const { error } = await getSupabaseClient()
    .from('media')
    .insert({
      captured_at: input.capturedAt,
      captured_tz: input.capturedTz,
      content_hash: input.contentHash,
      height: input.height,
      id: input.id,
      kind: video ? 'video' : 'photo',
      ...(video ? { duration_ms: input.durationMs } : {}),
      latitude: input.latitude,
      longitude: input.longitude,
      owner_id: input.ownerId,
      status: 'uploading',
      width: input.width,
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
