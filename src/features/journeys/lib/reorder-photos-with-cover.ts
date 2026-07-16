/**
 * Places the cover photo at index 0 so sync can set `is_cover` from position.
 * Other photos keep relative order.
 */
export function reorderPhotosWithCover<T>(items: T[], coverIndex: number): T[] {
  if (items.length === 0) {
    return items
  }

  const safeIndex = Math.min(Math.max(0, coverIndex), items.length - 1)
  if (safeIndex === 0) {
    return items
  }

  const next = [...items]
  const [cover] = next.splice(safeIndex, 1)
  if (cover === undefined) {
    return items
  }

  return [cover, ...next]
}

/**
 * After cover removal, pick the next cover index deterministically (former next,
 * or previous when the last photo was removed).
 */
export function nextCoverIndexAfterRemoval(
  removedIndex: number,
  previousCoverIndex: number,
  remainingCount: number,
): number | null {
  if (remainingCount <= 0) {
    return null
  }

  if (previousCoverIndex === removedIndex) {
    return Math.min(removedIndex, remainingCount - 1)
  }

  if (previousCoverIndex > removedIndex) {
    return previousCoverIndex - 1
  }

  return previousCoverIndex
}
