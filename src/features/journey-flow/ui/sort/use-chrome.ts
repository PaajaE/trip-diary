import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

/** Controls hide again this long after the mouse stopped (web full screen). */
export const CHROME_IDLE_MS = 2500

export interface ChromeApi {
  /**
   * Pointer moved over the screen: a mouse or pen shows the controls until
   * it is idle. Touch is ignored (its compatibility mouse events too): on
   * touch only a tap or the "show controls" button changes them.
   */
  onPointerMove: (event: ReactPointerEvent) => void
  /** Shows the controls (the visible "show controls" button). */
  show: () => void
  /** A tap on the photo: hidden -> shown, shown -> hidden. */
  toggle: () => void
  visible: boolean
}

/**
 * Visibility of the controls in full screen ("bez rušení"). Outside full
 * screen the controls are always there. Moving the mouse while the
 * controls are shown does not re-render the screen (only the idle timer
 * restarts).
 */
export function useChrome(
  fullscreen: boolean,
  /** Shown when full screen starts (sorting) or hidden (compare). */
  initiallyVisible = false,
): ChromeApi {
  const [visible, setVisible] = useState(initiallyVisible)
  const [wasFullscreen, setWasFullscreen] = useState(fullscreen)
  if (wasFullscreen !== fullscreen) {
    setWasFullscreen(fullscreen)
    setVisible(initiallyVisible)
  }
  const timer = useRef<number | null>(null)
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  useEffect(() => {
    if (!fullscreen) clear()
  }, [fullscreen])
  return {
    onPointerMove: (event) => {
      if (!fullscreen) return
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
      if (!visible) setVisible(true)
      clear()
      timer.current = window.setTimeout(() => {
        timer.current = null
        setVisible(false)
      }, CHROME_IDLE_MS)
    },
    show: () => {
      clear()
      setVisible(true)
    },
    toggle: () => {
      clear()
      setVisible((value) => !value)
    },
    visible: !fullscreen || visible,
  }
}
