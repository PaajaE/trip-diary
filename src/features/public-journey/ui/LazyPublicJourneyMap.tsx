import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ReaderMapAttribution } from '@/features/journeys/ui/ReaderMapAttribution'
import type { PublicJourneyMapProps } from '@/features/public-journey/ui/PublicJourneyMap'

// MapLibre (~265 KB) is only requested once the map is about to be seen.
const LazyMap = lazy(
  () => import('@/features/public-journey/ui/PublicJourneyMap'),
)

/** Reserved-height placeholder, identical to the map box (no layout shift). */
export function MapSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[22rem] w-full animate-pulse rounded-lg border border-border bg-surface sm:h-[28rem]"
    />
  )
}

/**
 * True once the element is within ~200 px of the viewport AND the browser is
 * idle. Without IntersectionObserver (old browsers, jsdom) it is true at once.
 */
function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  useEffect(() => {
    const element = ref.current
    if (near || element === null) return undefined
    let cancelIdle: (() => void) | undefined
    let cancelLoad: (() => void) | undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        // After the window load event (hero image included), so the 265 KB
        // map chunk never competes with the LCP image, then when idle.
        const afterIdle = () => {
          if (typeof window.requestIdleCallback === 'function') {
            const handle = window.requestIdleCallback(
              () => {
                setNear(true)
              },
              { timeout: 1500 },
            )
            cancelIdle = () => {
              window.cancelIdleCallback(handle)
            }
            return
          }
          const handle = window.setTimeout(() => {
            setNear(true)
          }, 0)
          cancelIdle = () => {
            window.clearTimeout(handle)
          }
        }
        if (document.readyState === 'complete') {
          afterIdle()
        } else {
          window.addEventListener('load', afterIdle, { once: true })
          cancelLoad = () => {
            window.removeEventListener('load', afterIdle)
          }
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelIdle?.()
      cancelLoad?.()
    }
  }, [near])
  return { near, ref }
}

export function PublicMapSection(props: PublicJourneyMapProps) {
  const { near, ref } = useNearViewport<HTMLDivElement>()
  return (
    <section>
      {near ? (
        <Suspense fallback={<MapSkeleton />}>
          <LazyMap {...props} />
        </Suspense>
      ) : (
        <div ref={ref}>
          <MapSkeleton />
        </div>
      )}
      <ReaderMapAttribution />
    </section>
  )
}
