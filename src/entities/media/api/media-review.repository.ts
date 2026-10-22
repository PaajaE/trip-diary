import {
  MEDIA_WITH_VARIANTS,
  toMediaItem,
} from '@/entities/media/api/media-library.repository'
import { countRpc } from '@/entities/media/api/media-trash.repository'
import {
  type MediaItem,
  MediaLibraryError,
} from '@/entities/media/model/media-library'
import { fetchAllPages } from '@/shared/api/fetch-all-pages'
import { getSupabaseClient } from '@/shared/api/supabase'

/**
 * Media the owner has not sorted yet (`reviewed_at` is null): live rows whose
 * upload finished, oldest capture first. Trashed rows never count; restoring
 * one from the trash brings it back here, because trashing leaves
 * `reviewed_at` untouched.
 */
export async function listUnreviewedMedia(
  journeyId: string,
): Promise<MediaItem[]> {
  const { data, error } = await fetchAllPages((from, to) =>
    getSupabaseClient()
      .from('media')
      .select(MEDIA_WITH_VARIANTS)
      .eq('journey_id', journeyId)
      .eq('status', 'ready')
      .is('deleted_at', null)
      .is('reviewed_at', null)
      .order('captured_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (error !== null) {
    throw new MediaLibraryError('list_failed', error.message, error)
  }
  return data.map(toMediaItem)
}

/** How many media still wait to be sorted (same filter as the list). */
export async function countUnreviewedMedia(journeyId: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('media')
    .select('id', { count: 'exact', head: true })
    .eq('journey_id', journeyId)
    .eq('status', 'ready')
    .is('deleted_at', null)
    .is('reviewed_at', null)
  if (error !== null) {
    throw new MediaLibraryError('list_failed', error.message, error)
  }
  return count ?? 0
}

/**
 * Marks media as sorted (or, with `reviewed: false`, back as waiting) through
 * mark_media_reviewed, 500 ids per call. All ids must belong to one journey.
 * Resolves with the number of rows whose state changed.
 */
export function markMediaReviewed(
  mediaIds: readonly string[],
  reviewed = true,
): Promise<number> {
  return countRpc(mediaIds, (part) =>
    getSupabaseClient().rpc('mark_media_reviewed', {
      p_media_ids: part,
      p_reviewed: reviewed,
    }),
  )
}
