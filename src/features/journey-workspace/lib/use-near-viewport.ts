import { useEffect, useState, type RefObject } from 'react'

/** Render window around the viewport, so content is ready before it scrolls in. */
export const NEAR_VIEWPORT_MARGIN = '1500px 0px'

/**
 * True once the element has been within `rootMargin` of the viewport (it then
 * stays true). Without IntersectionObserver everything counts as near.
 */
export function useNearViewport(
  ref: RefObject<Element | null>,
  force = false,
  /** Change it to re-check intersection (e.g. after a programmatic scroll). */
  recheck = 0,
): boolean {
  const supported = typeof IntersectionObserver !== 'undefined'
  const [near, setNear] = useState(!supported)
  // A forced element stays rendered once the force goes away (no flicker).
  if (force && !near) setNear(true)
  useEffect(() => {
    const element = ref.current
    if (near || element === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [near, ref, recheck])
  return near || force
}
