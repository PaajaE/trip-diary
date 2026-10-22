import type { MomentDay } from '@/features/journey-workspace/model/workspace-days'
import type {
  WorkspaceMoment,
  WorkspaceSegment,
  WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

const NO_NOTES: ReadonlySet<string> = new Set()

/** A day with at least this many photos and no star wants a best-of pass. */
export const CULL_MIN_PHOTOS = 15

/**
 * Ids of the moments that sit inside a segment (stage or trip, any depth)
 * whose own text is not empty. Such a day counts as written about.
 */
export function momentsUnderWrittenSegments(tree: WorkspaceTree): Set<string> {
  const out = new Set<string>()
  const walk = (node: WorkspaceSegment, inherited: boolean) => {
    const written = inherited || node.segment.body.trim() !== ''
    if (written) for (const entry of node.moments) out.add(entry.moment.id)
    for (const child of node.children) walk(child, written)
  }
  for (const root of tree.roots) walk(root, false)
  return out
}

/**
 * Does the day have any text? A note of the day (`hasNote`), a moment body or
 * a body of the segment that holds one of its moments. The overview cards,
 * the stage progress and the task bar all call this function.
 */
export function dayHasText(
  moments: readonly WorkspaceMoment[],
  writtenSegments: ReadonlySet<string>,
  hasNote = false,
): boolean {
  if (hasNote) return true
  return moments.some(
    (entry) =>
      entry.moment.body.trim() !== '' || writtenSegments.has(entry.moment.id),
  )
}

/** True when any photo or video of the day carries a star. */
export function dayHasStar(moments: readonly WorkspaceMoment[]): boolean {
  return moments.some((entry) => entry.media.some((item) => item.starred))
}

/** A busy day nobody has picked highlights from. */
export function dayNeedsCulling(photoCount: number, starred: boolean): boolean {
  return photoCount >= CULL_MIN_PHOTOS && !starred
}

export interface WorkspaceTasks {
  /** Days with at least 15 photos and no starred one. */
  daysToCull: { count: number; firstDay: string | null }
  /** Days without any text. */
  daysWithoutText: { count: number; firstDay: string | null }
  /** Photos and videos without a capture time. */
  mediaWithoutTime: {
    count: number
    /** Day of the first moment holding such media, else null. */
    firstDay: string | null
    /** Some of them belong to no moment (they live in the unassigned group). */
    unassigned: boolean
  }
  /** Segments waiting for accept or reject. */
  suggestions: { count: number; firstSegmentId: string | null }
}

function suggestionIds(tree: WorkspaceTree): string[] {
  const out: string[] = []
  const walk = (node: WorkspaceSegment) => {
    if (node.segment.origin === 'suggested') out.push(node.segment.id)
    node.children.forEach(walk)
  }
  tree.roots.forEach(walk)
  return out
}

/** Counts behind the task bar, computed from the data alone. */
export function computeTasks(
  tree: WorkspaceTree,
  days: readonly MomentDay[],
  /** Local days (day keys) that have a day note. */
  noteDays: ReadonlySet<string> = NO_NOTES,
): WorkspaceTasks {
  const written = momentsUnderWrittenSegments(tree)
  let withoutText = 0
  let firstWithoutText: string | null = null
  let toCull = 0
  let firstToCull: string | null = null
  let noTime = 0
  let firstNoTime: string | null = null
  for (const day of days) {
    if (!dayHasText(day.moments, written, noteDays.has(day.key))) {
      withoutText += 1
      firstWithoutText ??= day.key
    }
    if (dayNeedsCulling(day.photoCount, dayHasStar(day.moments))) {
      toCull += 1
      firstToCull ??= day.key
    }
    const missing = day.moments.reduce(
      (sum, entry) =>
        sum + entry.media.filter((item) => item.capturedAt === null).length,
      0,
    )
    if (missing > 0) {
      noTime += missing
      firstNoTime ??= day.key
    }
  }
  const unassignedMissing = tree.unassigned.filter(
    (item) => item.capturedAt === null,
  ).length
  const suggestions = suggestionIds(tree)
  return {
    daysToCull: { count: toCull, firstDay: firstToCull },
    daysWithoutText: { count: withoutText, firstDay: firstWithoutText },
    mediaWithoutTime: {
      count: noTime + unassignedMissing,
      firstDay: firstNoTime,
      unassigned: unassignedMissing > 0,
    },
    suggestions: {
      count: suggestions.length,
      firstSegmentId: suggestions[0] ?? null,
    },
  }
}
