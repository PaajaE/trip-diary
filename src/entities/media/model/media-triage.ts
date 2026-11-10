import type { MediaStatus } from '@/entities/media/model/media'

/**
 * Triage state of a media row, derived from its columns. No column of its own:
 * the database reuses status / reviewed_at / deleted_at / starred.
 *
 * Mirrors, exactly:
 *  - supabase/migrations/20261031120100_v2_media_found.sql, header
 *      undecided  status = 'found', reviewed_at IS NULL,     deleted_at IS NULL
 *      kept       status = 'found', reviewed_at IS NOT NULL, deleted_at IS NULL
 *      best       kept + starred
 *      dropped    status = 'found', deleted_at IS NOT NULL
 *  - supabase/migrations/20261110120000_v2_found_dismissed.sql, known_source_assets():
 *      case when status <> 'found' then 'uploaded'
 *           when deleted_at is not null then 'dismissed'
 *           when reviewed_at is not null then 'kept'
 *           else 'found' end
 *    and triage_found_media 'star' (sets reviewed_at together with starred).
 *
 * Precedence: not found -> 'uploaded'; deleted_at -> 'dismissed' (wins over
 * starred and reviewed: a dismissed row stays dismissed until restored);
 * reviewed_at + starred -> 'starred'; reviewed_at -> 'kept'; else 'found'.
 * A starred row that was never reviewed is still 'found': starring alone is a
 * plain `starred` update and does not keep the row (known_source_assets says
 * 'found' for it too).
 */
export type MediaTriageState =
  | 'found'
  | 'kept'
  | 'starred'
  | 'dismissed'
  | 'uploaded'

export interface MediaTriageRow {
  deletedAt: string | null
  reviewedAt: string | null
  starred: boolean
  status: MediaStatus
}

export function mediaTriageState(row: MediaTriageRow): MediaTriageState {
  if (row.status !== 'found') return 'uploaded'
  if (row.deletedAt !== null) return 'dismissed'
  if (row.reviewedAt !== null) return row.starred ? 'starred' : 'kept'
  return 'found'
}

/** Kept or starred: promote_found_media accepts it (reviewed, not dismissed). */
export function isPromotableTriageState(state: MediaTriageState): boolean {
  return state === 'kept' || state === 'starred'
}

/** Found rows carry no file; every "uploaded media" list must skip them. */
export function isUploadedMediaStatus(status: MediaStatus): boolean {
  return status !== 'found'
}
