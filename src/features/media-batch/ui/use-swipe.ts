import { useEffect, useRef, type TouchEvent } from 'react'

/** Same threshold as the culling view. UNVERIFIED on a real device. */
export const SWIPE_MIN_PX = 50
/** A swipe must be this much more along its axis than across it. */
const AXIS_RATIO = 1.5
/** A tap: shorter and smaller than this. */
const TAP_MAX_PX = 10
const TAP_MAX_MS = 300
/** A single tap waits this long so a double tap (zoom) can cancel it. */
export const TAP_DELAY_MS = 260

export type SwipeDirection = 'down' | 'left' | 'right' | 'up'

export interface SwipeHandlers {
  onTouchEnd: (event: TouchEvent) => void
  onTouchStart: (event: TouchEvent) => void
}

export interface SwipeOptions {
  enabled?: () => boolean
  onSwipe: (direction: SwipeDirection) => void
  /** Single tap (fires after TAP_DELAY_MS unless a second touch follows). */
  onTap?: () => void
}

/**
 * One-finger swipes (a second finger is a pinch, not a swipe) and single
 * taps on a photo stage. `enabled` is read at the end of the gesture, so a
 * zoomed photo can pan instead of swiping.
 */
export function useSwipe(options: SwipeOptions): SwipeHandlers {
  const start = useRef<{ at: number; x: number; y: number } | null>(null)
  const tapTimer = useRef<number | null>(null)
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  useEffect(
    () => () => {
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current)
    },
    [],
  )
  const cancelTap = () => {
    if (tapTimer.current === null) return
    window.clearTimeout(tapTimer.current)
    tapTimer.current = null
  }
  return {
    onTouchEnd: (event) => {
      const from = start.current
      const end = event.changedTouches[0]
      start.current = null
      const { enabled, onSwipe, onTap } = latest.current
      if (from === null || end === undefined) return
      if (enabled !== undefined && !enabled()) return
      const dx = end.clientX - from.x
      const dy = end.clientY - from.y
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      if (ay >= SWIPE_MIN_PX && ay > ax * AXIS_RATIO) {
        onSwipe(dy < 0 ? 'up' : 'down')
      } else if (ax >= SWIPE_MIN_PX && ax > ay * AXIS_RATIO) {
        onSwipe(dx > 0 ? 'right' : 'left')
      } else if (
        onTap !== undefined &&
        Math.hypot(dx, dy) <= TAP_MAX_PX &&
        event.timeStamp - from.at <= TAP_MAX_MS
      ) {
        tapTimer.current = window.setTimeout(() => {
          tapTimer.current = null
          latest.current.onTap?.()
        }, TAP_DELAY_MS)
      }
    },
    onTouchStart: (event) => {
      // A second touch soon after a tap is a double tap: no single tap.
      cancelTap()
      const point = event.touches[0]
      start.current =
        point === undefined || event.touches.length > 1
          ? null
          : { at: event.timeStamp, x: point.clientX, y: point.clientY }
    },
  }
}
