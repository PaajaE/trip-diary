/**
 * Pure parts of press-and-hold + drag selection: the contiguous range in
 * reading order between the anchor and the tile under the pointer, and the
 * speed of the edge auto-scroll.
 */

/** Ids from the anchor to the current tile (either direction), inclusive. */
export function dragRange(
  order: readonly string[],
  anchorId: string,
  currentId: string,
): string[] {
  const from = order.indexOf(anchorId)
  const to = order.indexOf(currentId)
  if (from < 0) return []
  if (to < 0) return [anchorId]
  const [a, b] = from <= to ? [from, to] : [to, from]
  return order.slice(a, b + 1)
}

/**
 * Selection while dragging: what was selected before the drag plus the range.
 * Moving back shrinks the range; the earlier selection is never touched.
 */
export function dragSelection(
  base: ReadonlySet<string>,
  order: readonly string[],
  anchorId: string,
  currentId: string,
): Set<string> {
  return new Set([...base, ...dragRange(order, anchorId, currentId)])
}

/** What to add and remove to get from one selection to the other. */
export function selectionDiff(
  from: ReadonlySet<string>,
  to: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  return {
    add: [...to].filter((id) => !from.has(id)),
    remove: [...from].filter((id) => !to.has(id)),
  }
}

/**
 * Pixels to scroll per frame for a pointer at `y` in a viewport `height` high:
 * negative near the top, positive near the bottom, 0 elsewhere. Faster the
 * closer to the edge.
 */
export function edgeScrollDelta(
  y: number,
  height: number,
  edge = 80,
  maxStep = 18,
): number {
  if (y < edge) return -Math.ceil(maxStep * Math.min(1, (edge - y) / edge))
  if (y > height - edge) {
    return Math.ceil(maxStep * Math.min(1, (y - (height - edge)) / edge))
  }
  return 0
}
