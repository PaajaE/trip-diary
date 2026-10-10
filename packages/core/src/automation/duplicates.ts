import { distanceKm } from './geo.ts'
import { pointOf, sortDated, type MediaPoint } from './media-point.ts'

export interface DuplicateOptions {
  /** Same photo uploaded twice keeps its capture time; allow rounding. */
  maxTimeDeltaMs?: number
  maxDistanceM?: number
}

/**
 * Groups media that are most likely the same photo imported more than once
 * (same capture time and position). Returns groups of ids, earliest id first.
 * Media without coordinates match on time alone.
 */
export function findDuplicateGroups(
  media: readonly MediaPoint[],
  options: DuplicateOptions = {},
): string[][] {
  const maxTimeDeltaMs = options.maxTimeDeltaMs ?? 1000
  const maxDistanceKm = (options.maxDistanceM ?? 10) / 1000
  const { dated } = sortDated(media)

  const groups: string[][] = []
  const assigned = new Set<string>()
  for (let i = 0; i < dated.length; i += 1) {
    const base = dated[i]
    if (base === undefined || assigned.has(base.id)) {
      continue
    }
    const group = [base.id]
    const basePoint = pointOf(base)
    for (let j = i + 1; j < dated.length; j += 1) {
      const other = dated[j]
      if (other === undefined || other.time - base.time > maxTimeDeltaMs) {
        break
      }
      const otherPoint = pointOf(other)
      const near =
        basePoint === null || otherPoint === null
          ? basePoint === otherPoint
          : distanceKm(basePoint, otherPoint) <= maxDistanceKm
      if (near && !assigned.has(other.id)) {
        group.push(other.id)
      }
    }
    if (group.length > 1) {
      for (const id of group) {
        assigned.add(id)
      }
      groups.push(group)
    }
  }
  return groups
}
