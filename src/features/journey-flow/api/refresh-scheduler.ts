/** Quiet time after the last sorting write before the tree is refreshed. */
export const REFRESH_QUIET_MS = 1500

export interface RefreshScheduler {
  /** A write starts: no refresh while any write is in flight. */
  begin: () => void
  /** A write ended: refresh once everything was quiet for a while. */
  end: () => void
  /**
   * Refresh now if one is due (leaving the screen, a failed write); with a
   * write in flight, right when the last one ends.
   */
  flush: () => void
  /**
   * A structural write ended (split, merge, confirm): refresh now and wait
   * for it, unless sorting writes are in flight (then when they end).
   */
  refreshNow: () => Promise<void>
}

/**
 * Coalesces the journey-tree refresh after sorting writes: never one per
 * tap, never while a write is in flight (its answer would be overwritten),
 * one refresh after `quietMs` without writes. The session shows its own
 * optimistic state meanwhile.
 */
export function createRefreshScheduler(
  refresh: () => Promise<unknown>,
  quietMs = REFRESH_QUIET_MS,
): RefreshScheduler {
  let inFlight = 0
  let due = false
  let now = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const fire = () => {
    clear()
    if (!due || inFlight > 0) return
    due = false
    now = false
    refresh().catch(() => undefined)
  }
  return {
    begin: () => {
      inFlight += 1
      clear()
    },
    end: () => {
      inFlight = Math.max(0, inFlight - 1)
      due = true
      clear()
      if (inFlight > 0) return
      if (now) fire()
      else timer = setTimeout(fire, quietMs)
    },
    flush: () => {
      if (!due && inFlight === 0) return
      now = true
      fire()
    },
    refreshNow: async () => {
      if (inFlight > 0) {
        due = true
        now = true
        return
      }
      clear()
      due = false
      now = false
      await refresh().catch(() => undefined)
    },
  }
}
