import { useEffect, useState } from 'react'

/** Controls hide again this long after the mouse stopped (web full screen). */
export const CHROME_IDLE_MS = 2500

export interface ChromeApi {
  /** Mouse moved: show the controls for a while. */
  poke: () => void
  toggle: () => void
  visible: boolean
}

/**
 * Visibility of the controls in full screen ("bez rušení"): a tap toggles
 * them, a mouse move shows them until the mouse is idle. Outside full screen
 * the controls are always there.
 */
export function useChrome(
  fullscreen: boolean,
  /** Shown when full screen starts (sorting) or hidden (compare). */
  initiallyVisible = false,
): ChromeApi {
  const [visible, setVisible] = useState(initiallyVisible)
  const [pokedAt, setPokedAt] = useState(0)
  const [wasFullscreen, setWasFullscreen] = useState(fullscreen)
  if (wasFullscreen !== fullscreen) {
    setWasFullscreen(fullscreen)
    setVisible(initiallyVisible)
  }
  useEffect(() => {
    if (!fullscreen || pokedAt === 0) return
    const timer = window.setTimeout(() => {
      setVisible(false)
    }, CHROME_IDLE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [fullscreen, pokedAt])
  return {
    poke: () => {
      if (!fullscreen) return
      setVisible(true)
      setPokedAt((value) => value + 1)
    },
    toggle: () => {
      setVisible((value) => !value)
    },
    visible: !fullscreen || visible,
  }
}
