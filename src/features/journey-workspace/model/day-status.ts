import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'

/**
 * Unreviewed means `reviewedAt` is explicitly null. An absent value (old
 * cached data from before the column was mapped) counts as reviewed, so a
 * stale cache never shows a false backlog.
 */
export function isUnreviewed(item: Pick<MediaItem, 'reviewedAt'>): boolean {
  return item.reviewedAt === null
}

/** Media count and unreviewed count over the moments of a day. */
export function dayMediaCounts(moments: readonly WorkspaceMoment[]): {
  total: number
  unreviewed: number
} {
  let total = 0
  let unreviewed = 0
  for (const entry of moments) {
    total += entry.media.length
    unreviewed += entry.media.filter(isUnreviewed).length
  }
  return { total, unreviewed }
}

export interface DayStatusInput {
  /** Day has a real calendar date (not the "unknown" group). */
  dated: boolean
  /** A day_notes row exists for the day. */
  hasNote: boolean
  total: number
  unreviewed: number
}

export interface DayStatus {
  note: 'has' | 'missing' | 'na'
  overall: 'notStarted' | 'inProgress' | 'done'
  photos: 'none' | 'pending' | 'done'
  unreviewed: number
}

/**
 * The state of a day is derived, never stored (plan 4e, principle 3):
 * photos are done when every media has `reviewed_at`, the note is done when
 * a day note exists.
 */
export function dayStatus({
  dated,
  hasNote,
  total,
  unreviewed,
}: DayStatusInput): DayStatus {
  const pending = Math.max(0, Math.min(unreviewed, total))
  const photos = total <= 0 ? 'none' : pending > 0 ? 'pending' : 'done'
  const note = !dated ? 'na' : hasNote ? 'has' : 'missing'
  let overall: DayStatus['overall']
  if ((photos === 'done' || photos === 'none') && note === 'has') {
    overall = 'done'
  } else if (photos === 'pending' && pending === total && !hasNote) {
    overall = 'notStarted'
  } else {
    overall = 'inProgress'
  }
  return { note, overall, photos, unreviewed: pending }
}

/** Done days of a stage out of all its days. */
export function chapterProgress(days: readonly { status: DayStatus }[]): {
  done: number
  total: number
} {
  return {
    done: days.filter((day) => day.status.overall === 'done').length,
    total: days.length,
  }
}
