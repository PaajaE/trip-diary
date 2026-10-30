import { confidenceFromMargin, distanceKm } from '@trip-diary/core/automation'
import { isUnreviewed } from '@/features/journey-workspace/model/day-status'
import type { Segment } from '@/entities/segment/model/segment'
import type { MomentDay } from '@/features/journey-workspace/model/workspace-days'
import {
  collectMoments,
  type WorkspaceMoment,
  type WorkspaceSegment,
  type WorkspaceTree,
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
  /** Photos and videos nobody has sorted yet (reviewed_at is null). */
  unreviewed: { count: number }
  /** Segments waiting for accept or reject. */
  suggestions: { count: number; firstSegmentId: string | null }
}

/** Suggested segments still waiting for accept or reject, tree order. */
export function suggestedSegments(tree: WorkspaceTree): Segment[] {
  const out: Segment[] = []
  const walk = (node: WorkspaceSegment) => {
    if (node.segment.origin === 'suggested') out.push(node.segment)
    node.children.forEach(walk)
  }
  tree.roots.forEach(walk)
  return out
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
  /** Tree whose suggestions are offered (the shown levels); default `tree`. */
  suggestionTree: WorkspaceTree = tree,
): WorkspaceTasks {
  const written = momentsUnderWrittenSegments(tree)
  let withoutText = 0
  let firstWithoutText: string | null = null
  let toCull = 0
  let firstToCull: string | null = null
  let noTime = 0
  let unreviewed = 0
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
    for (const entry of day.moments)
      unreviewed += entry.media.filter(isUnreviewed).length
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
  const suggestions = suggestionIds(suggestionTree)
  return {
    daysToCull: { count: toCull, firstDay: firstToCull },
    daysWithoutText: { count: withoutText, firstDay: firstWithoutText },
    mediaWithoutTime: {
      count: noTime + unassignedMissing,
      firstDay: firstNoTime,
      unassigned: unassignedMissing > 0,
    },
    unreviewed: {
      count: unreviewed + tree.unassigned.filter(isUnreviewed).length,
    },
    suggestions: {
      count: suggestions.length,
      firstSegmentId: suggestions[0] ?? null,
    },
  }
}

export type NextStepId =
  | 'noText'
  | 'noTime'
  | 'suggestions'
  | 'toCull'
  | 'unreviewed'

export interface NextStep {
  count: number
  id: NextStepId
  /** Rough time for the whole step, minutes (at least 1). */
  minutes: number
  /** The short version: only the first few items, minutes (at least 1). */
  shortMinutes: number
}

/** Seconds one item of a step takes (a guess to tune on real use, UNVERIFIED). */
const SECONDS_PER_ITEM: Record<NextStepId, number> = {
  noText: 60,
  noTime: 20,
  suggestions: 15,
  toCull: 90,
  unreviewed: 3,
}

/** The "just 2 minutes" version covers at most this many seconds of work. */
const SHORT_STEP_SECONDS = 120

/**
 * The one next step, in the fixed order of the web spec: sort, approve the
 * stages, pick the best photos, write, then the leftovers. Null when nothing
 * is waiting.
 */
export function nextStep(tasks: WorkspaceTasks): NextStep | null {
  const order: [NextStepId, number][] = [
    ['unreviewed', tasks.unreviewed.count],
    ['suggestions', tasks.suggestions.count],
    ['toCull', tasks.daysToCull.count],
    ['noText', tasks.daysWithoutText.count],
    ['noTime', tasks.mediaWithoutTime.count],
  ]
  const found = order.find(([, count]) => count > 0)
  if (found === undefined) return null
  const [id, count] = found
  const seconds = count * SECONDS_PER_ITEM[id]
  return {
    count,
    id,
    minutes: Math.max(1, Math.ceil(seconds / 60)),
    shortMinutes: Math.max(
      1,
      Math.ceil(Math.min(seconds, SHORT_STEP_SECONDS) / 60),
    ),
  }
}

/** A suggestion this sure (0-1) is accepted by "Accept all above 80 %". */
export const SUGGESTION_AUTO_ACCEPT_MIN = 0.8

/** Distance (km) the author moved at a suggested boundary that counts as a clear move. */
const SUGGESTION_MOVE_KM = 80

export interface SuggestionConfidence {
  /** 0-1: from how far the journey moved at the start of the segment. */
  confidence: number
  segment: Segment
}

/**
 * How sure we are about each waiting suggestion. A stage or trip that starts
 * after the photographer moved far (a flight, a long drive) is a clear
 * boundary (80 km is 0.5, 240 km is certain); one that starts after a short
 * hop is doubtful (below 0.5). UNVERIFIED on real journeys.
 */
export function suggestionConfidences(
  tree: WorkspaceTree,
): SuggestionConfidence[] {
  const all = collectMoments(tree)
  const located = all.filter(
    (entry) =>
      entry.moment.latitude !== null && entry.moment.longitude !== null,
  )
  const firstOf = (node: WorkspaceSegment): WorkspaceMoment | null => {
    const own = [...node.moments]
    const walk = (child: WorkspaceSegment) => {
      own.push(...child.moments)
      child.children.forEach(walk)
    }
    node.children.forEach(walk)
    const sorted = own
      .filter((e) => e.moment.latitude !== null && e.moment.longitude !== null)
      .sort((a, b) => a.moment.startsAt.localeCompare(b.moment.startsAt))
    return sorted[0] ?? null
  }
  return suggestedNodes(tree).map((node) => {
    const first = firstOf(node)
    if (first === null) return { confidence: 0.5, segment: node.segment }
    const before = located
      .filter((entry) => entry.moment.startsAt < first.moment.startsAt)
      .at(-1)
    if (
      before === undefined ||
      first.moment.latitude === null ||
      first.moment.longitude === null ||
      before.moment.latitude === null ||
      before.moment.longitude === null
    ) {
      return { confidence: 0.5, segment: node.segment }
    }
    const moved = distanceKm(
      { latitude: before.moment.latitude, longitude: before.moment.longitude },
      { latitude: first.moment.latitude, longitude: first.moment.longitude },
    )
    return {
      // Below the threshold the boundary is doubtful, above it grows sure.
      confidence:
        moved >= SUGGESTION_MOVE_KM
          ? confidenceFromMargin(moved, SUGGESTION_MOVE_KM, 160)
          : (0.5 * moved) / SUGGESTION_MOVE_KM,
      segment: node.segment,
    }
  })
}

/** Suggestions that are sure enough to accept in one go. */
export function confidentSuggestions(
  tree: WorkspaceTree,
  min: number = SUGGESTION_AUTO_ACCEPT_MIN,
): Segment[] {
  return suggestionConfidences(tree)
    .filter((item) => item.confidence >= min)
    .map((item) => item.segment)
}

function suggestedNodes(tree: WorkspaceTree): WorkspaceSegment[] {
  const out: WorkspaceSegment[] = []
  const walk = (node: WorkspaceSegment) => {
    if (node.segment.origin === 'suggested') out.push(node)
    node.children.forEach(walk)
  }
  tree.roots.forEach(walk)
  return out
}
