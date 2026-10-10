import type { MediaItem } from '@/entities/media/model/media-library'
import type { Moment } from '@/entities/moment/model/moment'
import type { Segment } from '@/entities/segment/model/segment'

export interface WorkspaceMoment {
  cover: MediaItem | null
  media: MediaItem[]
  moment: Moment
  photoCount: number
  /** Zone for display: first media capture zone, else the segment zone. */
  tz: string | null
  videoCount: number
}

export interface WorkspaceSegment {
  children: WorkspaceSegment[]
  cover: MediaItem | null
  moments: WorkspaceMoment[]
  /** Counts include nested trips and their moments. */
  photoCount: number
  segment: Segment
  videoCount: number
}

export interface WorkspaceTree {
  /** Moments that fall inside no segment. */
  looseMoments: WorkspaceMoment[]
  /** Stages plus trips that have no usable parent, ordered by time. */
  roots: WorkspaceSegment[]
  /** Media that belongs to no (known) moment. */
  unassigned: MediaItem[]
}

function time(iso: string | null): number {
  return iso === null ? Number.POSITIVE_INFINITY : Date.parse(iso)
}

function bySegmentOrder(a: Segment, b: Segment): number {
  return (
    time(a.startsAt) - time(b.startsAt) ||
    a.position - b.position ||
    a.id.localeCompare(b.id)
  )
}

function byMediaOrder(a: MediaItem, b: MediaItem): number {
  return time(a.capturedAt) - time(b.capturedAt) || a.id.localeCompare(b.id)
}

function byMomentOrder(a: Moment, b: Moment): number {
  return time(a.startsAt) - time(b.startsAt) || a.id.localeCompare(b.id)
}

function span(segment: Segment): number {
  return time(segment.endsAt) - time(segment.startsAt)
}

function contains(segment: Segment, instant: number): boolean {
  return time(segment.startsAt) <= instant && instant <= time(segment.endsAt)
}

function countKinds(media: MediaItem[]): { photos: number; videos: number } {
  let videos = 0
  for (const item of media) if (item.kind === 'video') videos += 1
  return { photos: media.length - videos, videos }
}

/**
 * Builds the read-only v2 hierarchy: stages > trips > moments > media.
 * Nesting uses parent_id; a trip without a usable parent (null, missing or
 * cyclic) is nested by time containment under the tightest stage, else it
 * becomes a root. Moments go to the tightest segment containing their start.
 */
export function buildWorkspaceTree(
  segments: Segment[],
  moments: Moment[],
  media: MediaItem[],
): WorkspaceTree {
  const segmentById = new Map(segments.map((s) => [s.id, s]))
  const mediaById = new Map(media.map((m) => [m.id, m]))

  const parentOf = new Map<string, string | null>()
  for (const segment of segments) {
    let parentId: string | null = null
    if (
      segment.parentId !== null &&
      segment.parentId !== segment.id &&
      segmentById.has(segment.parentId)
    ) {
      parentId = segment.parentId
    } else if (segment.kind === 'trip') {
      const start = time(segment.startsAt)
      const candidates = segments
        .filter(
          (other) =>
            other.kind === 'stage' &&
            other.id !== segment.id &&
            contains(other, start) &&
            time(segment.endsAt) <= time(other.endsAt),
        )
        .sort((a, b) => span(a) - span(b) || a.id.localeCompare(b.id))
      parentId = candidates[0]?.id ?? null
    }
    parentOf.set(segment.id, parentId)
  }
  // Break explicit parent cycles: a segment that reaches itself becomes a root.
  for (const segment of segments) {
    const seen = new Set<string>([segment.id])
    let cursor = parentOf.get(segment.id) ?? null
    while (cursor !== null) {
      if (seen.has(cursor)) {
        parentOf.set(segment.id, null)
        break
      }
      seen.add(cursor)
      cursor = parentOf.get(cursor) ?? null
    }
  }

  const momentIds = new Set(moments.map((m) => m.id))
  const mediaByMoment = new Map<string, MediaItem[]>()
  const unassigned: MediaItem[] = []
  for (const item of [...media].sort(byMediaOrder)) {
    if (item.momentId !== null && momentIds.has(item.momentId)) {
      const list = mediaByMoment.get(item.momentId) ?? []
      list.push(item)
      mediaByMoment.set(item.momentId, list)
    } else {
      unassigned.push(item)
    }
  }

  const nodes = new Map<string, WorkspaceSegment>()
  for (const segment of segments) {
    nodes.set(segment.id, {
      children: [],
      cover: null,
      moments: [],
      photoCount: 0,
      segment,
      videoCount: 0,
    })
  }

  const looseMoments: WorkspaceMoment[] = []
  for (const moment of [...moments].sort(byMomentOrder)) {
    const items = mediaByMoment.get(moment.id) ?? []
    const start = time(moment.startsAt)
    const owner =
      segments
        .filter((s) => contains(s, start))
        .sort(
          (a, b) =>
            (a.kind === b.kind ? 0 : a.kind === 'trip' ? -1 : 1) ||
            span(a) - span(b) ||
            a.id.localeCompare(b.id),
        )[0] ?? null
    const counts = countKinds(items)
    const cover =
      (moment.coverMediaId !== null
        ? items.find((i) => i.id === moment.coverMediaId)
        : undefined) ??
      items[0] ??
      null
    const node: WorkspaceMoment = {
      cover,
      media: items,
      moment,
      photoCount: counts.photos,
      tz:
        items.find((i) => i.capturedTz !== null)?.capturedTz ??
        owner?.tz ??
        null,
      videoCount: counts.videos,
    }
    if (owner === null) looseMoments.push(node)
    else nodes.get(owner.id)?.moments.push(node)
  }

  const roots: WorkspaceSegment[] = []
  for (const segment of [...segments].sort(bySegmentOrder)) {
    const node = nodes.get(segment.id)
    if (node === undefined) continue
    const parentId = parentOf.get(segment.id) ?? null
    const parentNode = parentId === null ? undefined : nodes.get(parentId)
    if (parentNode === undefined) roots.push(node)
    else parentNode.children.push(node)
  }

  function finalize(node: WorkspaceSegment): MediaItem[] {
    const all: MediaItem[] = []
    for (const m of node.moments) all.push(...m.media)
    for (const child of node.children) all.push(...finalize(child))
    all.sort(byMediaOrder)
    const counts = countKinds(all)
    node.photoCount = counts.photos
    node.videoCount = counts.videos
    node.cover =
      (node.segment.coverMediaId !== null
        ? mediaById.get(node.segment.coverMediaId)
        : undefined) ??
      all[0] ??
      null
    return all
  }
  for (const root of roots) finalize(root)

  return { looseMoments, roots, unassigned }
}

export function isWorkspaceEmpty(tree: WorkspaceTree): boolean {
  return (
    tree.roots.length === 0 &&
    tree.looseMoments.length === 0 &&
    tree.unassigned.length === 0
  )
}

/** Flattens every moment in the tree (document order is not guaranteed). */
export function collectMoments(tree: WorkspaceTree): WorkspaceMoment[] {
  const out: WorkspaceMoment[] = [...tree.looseMoments]
  function walk(node: WorkspaceSegment) {
    out.push(...node.moments)
    node.children.forEach(walk)
  }
  tree.roots.forEach(walk)
  return out.sort((a, b) => byMomentOrder(a.moment, b.moment))
}
