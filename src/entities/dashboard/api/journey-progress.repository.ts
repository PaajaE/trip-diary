import { z } from 'zod'
import {
  MEDIA_WITH_VARIANTS,
  toMediaItem,
} from '@/entities/media/api/media-library.repository'
import type { MediaItem } from '@/entities/media/model/media-library'
import { getSupabaseClient } from '@/shared/api/supabase'

/** One row of the `journey_progress` RPC; `cover_media_id` is null without media. */
export const journeyProgressRowSchema = z.object({
  cover_media_id: z.uuid().nullable(),
  days_total: z.number().int().nonnegative(),
  days_with_note: z.number().int().nonnegative(),
  journey_id: z.uuid(),
  media_total: z.number().int().nonnegative(),
  media_unreviewed: z.number().int().nonnegative(),
  starred: z.number().int().nonnegative(),
})

export interface JourneyProgress {
  coverMediaId: string | null
  daysTotal: number
  daysWithNote: number
  journeyId: string
  mediaTotal: number
  mediaUnreviewed: number
  starred: number
}

export function parseJourneyProgressRows(data: unknown): JourneyProgress[] {
  return z
    .array(journeyProgressRowSchema)
    .parse(data)
    .map((row) => ({
      coverMediaId: row.cover_media_id,
      daysTotal: row.days_total,
      daysWithNote: row.days_with_note,
      journeyId: row.journey_id,
      mediaTotal: row.media_total,
      mediaUnreviewed: row.media_unreviewed,
      starred: row.starred,
    }))
}

/**
 * Progress of the given journeys through the `journey_progress` RPC. Throws
 * when the RPC is missing or fails; callers treat that as "no progress".
 */
export async function getJourneyProgress(
  journeyIds: string[],
): Promise<JourneyProgress[]> {
  if (journeyIds.length === 0) return []
  const { data, error } = await getSupabaseClient().rpc('journey_progress', {
    p_journey_ids: journeyIds,
  })
  if (error !== null) throw new Error(error.message)
  return parseJourneyProgressRows(data)
}

/**
 * Cover media (with variants) for many journeys in ONE query, keyed by media
 * id. Trashed or unfinished media are skipped.
 */
export async function getCoverMedia(
  mediaIds: string[],
): Promise<Map<string, MediaItem>> {
  const covers = new Map<string, MediaItem>()
  if (mediaIds.length === 0) return covers
  const { data, error } = await getSupabaseClient()
    .from('media')
    .select(MEDIA_WITH_VARIANTS)
    .in('id', mediaIds)
    .eq('status', 'ready')
    .is('deleted_at', null)
  if (error !== null) throw new Error(error.message)
  for (const row of data) {
    const item = toMediaItem(row)
    covers.set(item.id, item)
  }
  return covers
}
