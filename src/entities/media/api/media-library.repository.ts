import type { Database } from '@/shared/api/database.types'
import {
  type MediaItem,
  MediaLibraryError,
  type MediaMetaPatch,
  mediaItemSchema,
} from '@/entities/media/model/media-library'
import { getSupabaseClient } from '@/shared/api/supabase'

type MediaRow = Database['public']['Tables']['media']['Row']
type VariantRow = Database['public']['Tables']['media_variants']['Row']
type MediaWithVariants = MediaRow & { media_variants: VariantRow[] }
type MediaUpdate = Database['public']['Tables']['media']['Update']

const MEDIA_WITH_VARIANTS = '*, media_variants(*)'

function toMediaItem(row: MediaWithVariants): MediaItem {
  const parsed = mediaItemSchema.safeParse({
    altitude: row.altitude,
    caption: row.caption,
    capturedAt: row.captured_at,
    capturedTz: row.captured_tz,
    createdAt: row.created_at,
    durationMs: row.duration_ms,
    focalX: row.focal_x,
    focalY: row.focal_y,
    height: row.height,
    hideLocation: row.hide_location,
    id: row.id,
    journeyId: row.journey_id,
    kind: row.kind,
    latitude: row.latitude,
    longitude: row.longitude,
    momentId: row.moment_id,
    ownerId: row.owner_id,
    segmentOverrideId: row.segment_override_id,
    starred: row.starred,
    status: row.status,
    updatedAt: row.updated_at,
    variants: row.media_variants.map((variant) => ({
      byteSize: variant.byte_size,
      createdAt: variant.created_at,
      height: variant.height,
      kind: variant.kind,
      mediaId: variant.media_id,
      mimeType: variant.mime_type,
      storageKey: variant.storage_key,
      width: variant.width,
    })),
    width: row.width,
  })
  if (!parsed.success) {
    throw new MediaLibraryError(
      'invalid_row',
      parsed.error.message,
      parsed.error,
    )
  }
  return parsed.data
}

/** Lists a journey's media (all statuses) with variants, oldest capture first. */
export async function listJourneyMedia(
  journeyId: string,
): Promise<MediaItem[]> {
  const { data, error } = await getSupabaseClient()
    .from('media')
    .select(MEDIA_WITH_VARIANTS)
    .eq('journey_id', journeyId)
    .order('captured_at', { ascending: true, nullsFirst: false })
  if (error !== null) {
    throw new MediaLibraryError('list_failed', error.message, error)
  }
  return data.map(toMediaItem)
}

async function updateMedia(
  mediaId: string,
  update: MediaUpdate,
): Promise<MediaItem> {
  const { data, error } = await getSupabaseClient()
    .from('media')
    .update(update)
    .eq('id', mediaId)
    .select(MEDIA_WITH_VARIANTS)
    .maybeSingle()
  if (error !== null) {
    throw new MediaLibraryError('update_failed', error.message, error)
  }
  if (data === null) {
    throw new MediaLibraryError('not_found')
  }
  return toMediaItem(data)
}

export function updateMediaMeta(
  mediaId: string,
  patch: MediaMetaPatch,
): Promise<MediaItem> {
  const update: MediaUpdate = {}
  if (patch.caption !== undefined) update.caption = patch.caption
  if (patch.focalX !== undefined) update.focal_x = patch.focalX
  if (patch.focalY !== undefined) update.focal_y = patch.focalY
  if (patch.hideLocation !== undefined)
    update.hide_location = patch.hideLocation
  if (patch.starred !== undefined) update.starred = patch.starred
  if (Object.keys(update).length === 0) {
    return Promise.reject(new MediaLibraryError('invalid_input', 'empty patch'))
  }
  return updateMedia(mediaId, update)
}

/** Moves a media item into a moment, or detaches it with null. */
export function assignMediaToMoment(
  mediaId: string,
  momentId: string | null,
): Promise<MediaItem> {
  return updateMedia(mediaId, { moment_id: momentId })
}

/** Moves many media into one moment with a single update. */
export async function assignMediaBatchToMoment(
  mediaIds: string[],
  momentId: string,
): Promise<void> {
  if (mediaIds.length === 0) return
  const { error } = await getSupabaseClient()
    .from('media')
    .update({ moment_id: momentId })
    .in('id', mediaIds)
  if (error !== null) {
    throw new MediaLibraryError('update_failed', error.message, error)
  }
}
