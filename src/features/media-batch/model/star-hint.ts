/**
 * "Seen" flag of the one-time ★ explanation. A per-viewer convenience only:
 * nothing depends on it, and blocked storage just shows the hint again.
 */
export const STAR_HINT_KEY = 'trip-diary:star-hint-seen'

export function starHintSeen(): boolean {
  try {
    return window.localStorage.getItem(STAR_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function markStarHintSeen(): void {
  try {
    window.localStorage.setItem(STAR_HINT_KEY, '1')
  } catch {
    // Storage may be blocked; the hint then shows again next time.
  }
}
