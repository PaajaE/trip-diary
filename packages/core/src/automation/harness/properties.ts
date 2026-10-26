import { compareText } from '../compare.ts'
import { createRng, type HarnessPoint } from './scenarios.ts'

/** One group an algorithm returns, with its stable anchor id. */
export interface PredictedGroup {
  anchorId: string
  ids: string[]
  /** 'en_route' groups are collapsed photos on the way, not stops. */
  kind?: 'en_route' | 'point' | 'stay'
}

export type GroupingAlgorithm = (
  points: readonly HarnessPoint[],
) => PredictedGroup[]

export interface PropertyResult {
  holds: boolean
  /** Human readable reasons, empty when the property holds. */
  violations: string[]
}

function result(violations: string[]): PropertyResult {
  return { holds: violations.length === 0, violations }
}

function canonical(groups: readonly PredictedGroup[]): string[] {
  return groups
    .map((group) => `${group.anchorId}|${[...group.ids].sort().join(',')}`)
    .sort()
}

function membership(groups: readonly PredictedGroup[]): Set<string> {
  return new Set(groups.map((group) => [...group.ids].sort().join(',')))
}

/** Seeded Fisher-Yates shuffle (returns a copy). */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed)
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1))
    const a = copy[index]
    const b = copy[other]
    if (a === undefined || b === undefined) continue
    copy[index] = b
    copy[other] = a
  }
  return copy
}

/** The result does not depend on the order the input arrives in. */
export function orderIndependence(
  algorithm: GroupingAlgorithm,
  points: readonly HarnessPoint[],
  seeds: readonly number[] = [1, 2, 3],
): PropertyResult {
  const reference = JSON.stringify(canonical(algorithm(points)))
  const violations: string[] = []
  for (const seed of seeds) {
    const other = JSON.stringify(canonical(algorithm(shuffled(points, seed))))
    if (other !== reference)
      violations.push(`shuffle seed ${String(seed)} differs`)
  }
  return result(violations)
}

/** The same input twice gives exactly the same output (order included). */
export function determinism(
  algorithm: GroupingAlgorithm,
  points: readonly HarnessPoint[],
): PropertyResult {
  const first = JSON.stringify(algorithm(points))
  const second = JSON.stringify(algorithm(points))
  return result(first === second ? [] : ['two runs differ'])
}

function startOfGroup(
  group: PredictedGroup,
  times: ReadonlyMap<string, number>,
): number {
  let start = Number.POSITIVE_INFINITY
  for (const id of group.ids) {
    start = Math.min(start, times.get(id) ?? Number.POSITIVE_INFINITY)
  }
  return start
}

/**
 * Idempotence for a grouping: feeding the photos of one predicted group
 * back in alone must return that same single group (a settled group does
 * not fall apart when it is processed again). A collapsed 'en_route' group
 * is defined by the stops around it, so it is fed together with the groups
 * before and after it and must come back unchanged.
 */
export function idempotence(
  algorithm: GroupingAlgorithm,
  points: readonly HarnessPoint[],
): PropertyResult {
  const violations: string[] = []
  const times = new Map(
    points.map((point) => [point.id, Date.parse(point.capturedAt)]),
  )
  const groups = [...algorithm(points)].sort(
    (a, b) =>
      startOfGroup(a, times) - startOfGroup(b, times) ||
      compareText(a.anchorId, b.anchorId),
  )
  groups.forEach((group, index) => {
    const feed = new Set(group.ids)
    if (group.kind === 'en_route') {
      for (const other of [groups[index - 1], groups[index + 1]]) {
        for (const id of other?.ids ?? []) feed.add(id)
      }
    }
    const again = algorithm(points.filter((point) => feed.has(point.id)))
    const same = again.find(
      (candidate) => candidate.anchorId === group.anchorId,
    )
    const expected = new Set(group.ids)
    const unchanged =
      same?.ids.length === expected.size &&
      same.ids.every((id) => expected.has(id))
    if (!unchanged) {
      violations.push(
        `group ${group.anchorId} re-splits into ${String(again.length)}`,
      )
    }
  })
  return result(violations)
}

export type FarPhotoPlacement = 'interleaved' | 'later'

/** Three photos ~900 km away, by another author, placed in or after the set. */
export function farPhotos(
  points: readonly HarnessPoint[],
  placement: FarPhotoPlacement,
): HarnessPoint[] {
  const times = points
    .map((point) => Date.parse(point.capturedAt))
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b)
  const first = times[0] ?? 0
  const last = times[times.length - 1] ?? 0
  const base =
    placement === 'later'
      ? last + 30 * 3_600_000
      : Math.round((first + last) / 2)
  return [0, 1, 2].map((index) => ({
    author: 'far-author',
    // Formats a synthetic instant, no clock is read.
    capturedAt: new Date(base + index * 60_000).toISOString(),
    device: 'far-device',
    id: `far-${String(index)}`,
    kind: 'photo',
    latitude: 58 + index * 0.0001,
    longitude: 14.4,
  }))
}

/**
 * "Locked stop": adding far-away photos never changes the membership of a
 * group that already exists (every original group is still a group).
 */
export function farPhotosKeepGroups(
  algorithm: GroupingAlgorithm,
  points: readonly HarnessPoint[],
  placement: FarPhotoPlacement,
): PropertyResult {
  const before = algorithm(points)
  const after = membership(
    algorithm([...points, ...farPhotos(points, placement)]),
  )
  const violations: string[] = []
  for (const group of before) {
    if (!after.has([...group.ids].sort().join(','))) {
      violations.push(`group ${group.anchorId} changed (${placement})`)
    }
  }
  return result(violations)
}

function oldestFirst(a: HarnessPoint, b: HarnessPoint): number {
  return (
    Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
    compareText(a.id, b.id)
  )
}

/**
 * Stable ids: the anchor of every group is its oldest photo (ties by id), and
 * adding photos later in time keeps all existing anchors.
 */
export function stableIds(
  algorithm: GroupingAlgorithm,
  points: readonly HarnessPoint[],
): PropertyResult {
  const byId = new Map(points.map((point) => [point.id, point]))
  const violations: string[] = []
  const before = algorithm(points)
  for (const group of before) {
    const members = group.ids
      .map((id) => byId.get(id))
      .filter((point): point is HarnessPoint => point !== undefined)
    const oldest = [...members].sort(oldestFirst)[0]
    if (oldest?.id !== group.anchorId) {
      violations.push(`anchor ${group.anchorId} is not the oldest photo`)
    }
  }
  const after = new Set(
    algorithm([...points, ...farPhotos(points, 'later')]).map(
      (group) => group.anchorId,
    ),
  )
  for (const group of before) {
    if (!after.has(group.anchorId)) {
      violations.push(`anchor ${group.anchorId} lost after later photos`)
    }
  }
  return result(violations)
}
