import type { MediaItem } from '@/entities/media/model/media-library'
import type { Moment } from '@/entities/moment/model/moment'
import type { Segment } from '@/entities/segment/model/segment'
import type {
  WorkspaceMoment,
  WorkspaceSegment,
  WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

function ms(iso: string): number {
  return Date.parse(iso)
}

export interface SplitCandidate {
  /** UTC instant to pass as p_at: captured_at of the first media of the new part. */
  at: string
  /** Media that stay in the original moment (timed ones before `at`, plus untimed). */
  keepCount: number
  /** Media that move to the new moment (captured_at >= at). */
  moveCount: number
  /** First media of the new part, for display. */
  firstOfNew: MediaItem
}

/**
 * Split points lie BETWEEN two consecutive timed media with different capture
 * instants, so each side keeps at least one media. Media without captured_at
 * stay in the original and are never a boundary. The instant must also be
 * accepted by the DB: starts_at < at <= ends_at.
 */
export function splitCandidates(entry: WorkspaceMoment): SplitCandidate[] {
  const timed = entry.media
    .filter(
      (m): m is MediaItem & { capturedAt: string } => m.capturedAt !== null,
    )
    .sort(
      (a, b) => ms(a.capturedAt) - ms(b.capturedAt) || a.id.localeCompare(b.id),
    )
  const untimed = entry.media.length - timed.length
  const start = ms(entry.moment.startsAt)
  const end = ms(entry.moment.endsAt)
  const out: SplitCandidate[] = []
  for (let i = 1; i < timed.length; i += 1) {
    const prev = timed[i - 1]
    const next = timed[i]
    if (prev === undefined || next === undefined) continue
    const at = ms(next.capturedAt)
    if (at === ms(prev.capturedAt)) continue // equal instants cannot be separated
    if (!(at > start && at <= end)) continue
    out.push({
      at: next.capturedAt,
      firstOfNew: next,
      keepCount: i + untimed,
      moveCount: timed.length - i,
    })
  }
  return out
}

export function canSplit(entry: WorkspaceMoment): boolean {
  return splitCandidates(entry).length > 0
}

/** Neighbours of a moment in start order (ties broken by id). */
export function findAdjacentMoments(
  moments: WorkspaceMoment[],
  momentId: string,
): { next: WorkspaceMoment | null; previous: WorkspaceMoment | null } {
  const sorted = [...moments].sort(
    (a, b) =>
      ms(a.moment.startsAt) - ms(b.moment.startsAt) ||
      a.moment.id.localeCompare(b.moment.id),
  )
  const index = sorted.findIndex((m) => m.moment.id === momentId)
  if (index < 0) return { next: null, previous: null }
  return {
    next: sorted[index + 1] ?? null,
    previous: index > 0 ? (sorted[index - 1] ?? null) : null,
  }
}

export interface SegmentPair {
  after: WorkspaceSegment
  before: WorkspaceSegment
}

function pairsAmong(siblings: WorkspaceSegment[]): SegmentPair[] {
  const out: SegmentPair[] = []
  for (const before of siblings) {
    for (const after of siblings) {
      if (
        before !== after &&
        before.segment.kind === after.segment.kind &&
        ms(before.segment.endsAt) === ms(after.segment.startsAt) &&
        ms(before.segment.startsAt) < ms(after.segment.endsAt)
      ) {
        out.push({ after, before })
      }
    }
  }
  return out
}

/**
 * Sibling segments of the same kind where one ends exactly when the other
 * starts. Siblings share a parent (or are both roots).
 */
export function adjacentSegmentPairs(tree: WorkspaceTree): SegmentPair[] {
  const out = pairsAmong(tree.roots)
  function walk(node: WorkspaceSegment) {
    out.push(...pairsAmong(node.children))
    node.children.forEach(walk)
  }
  tree.roots.forEach(walk)
  return out
}

export interface BoundaryCandidate {
  at: string
  /** Zone to display the instant in (the media's or moment's own zone). */
  tz: string | null
}

/**
 * Instants where the shared edge of two adjacent segments may move: taken
 * from moment edges and media capture times, strictly inside both segments,
 * different from the current boundary, and never strictly inside a moment
 * (a boundary must not cut a moment). Sorted, de-duplicated.
 */
export function boundaryCandidates(
  before: Segment,
  after: Segment,
  moments: WorkspaceMoment[],
  looseMedia: MediaItem[],
): BoundaryCandidate[] {
  const low = ms(before.startsAt)
  const high = ms(after.endsAt)
  const current = ms(before.endsAt)
  const ranges = moments.map((m: { moment: Moment }) => ({
    end: ms(m.moment.endsAt),
    start: ms(m.moment.startsAt),
  }))
  const found = new Map<number, BoundaryCandidate>()
  function offer(iso: string | null, tz: string | null) {
    if (iso === null) return
    const t = ms(iso)
    if (!(t > low && t < high) || t === current) return
    if (ranges.some((r) => t > r.start && t < r.end)) return
    const existing = found.get(t)
    if (existing === undefined || (existing.tz === null && tz !== null)) {
      found.set(t, { at: iso, tz })
    }
  }
  const fallbackTz = before.tz ?? after.tz
  for (const item of looseMedia) {
    offer(item.capturedAt, item.capturedTz ?? fallbackTz)
  }
  for (const entry of moments) {
    for (const item of entry.media) {
      offer(item.capturedAt, item.capturedTz ?? entry.tz ?? fallbackTz)
    }
    const tz = entry.tz ?? fallbackTz
    offer(entry.moment.startsAt, tz)
    offer(entry.moment.endsAt, tz)
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c)
}
