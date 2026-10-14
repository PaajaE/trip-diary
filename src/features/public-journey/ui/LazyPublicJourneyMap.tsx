import { lazy, Suspense } from 'react'
import { ReaderMapAttribution } from '@/features/journeys/ui/ReaderMapAttribution'
import type { PublicJourneyMapProps } from '@/features/public-journey/ui/PublicJourneyMap'

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

export function PublicMapSection(props: PublicJourneyMapProps) {
  return (
    <section>
      <Suspense fallback={<MapSkeleton />}>
        <LazyMap {...props} />
      </Suspense>
      <ReaderMapAttribution />
    </section>
  )
}
