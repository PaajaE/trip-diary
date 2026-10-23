import { MapSkeleton } from '@/features/public-journey/ui/LazyPublicJourneyMap'

/** Layout-matching placeholder: hero, map and cards reserve their final size. */
export function PublicJourneySkeleton() {
  return (
    <main aria-busy="true">
      <div className="h-[clamp(22rem,46vw,36rem)] w-full animate-pulse bg-surface" />
      <div className="mx-auto max-w-6xl space-y-8 px-5 py-10">
        <div className="space-y-3">
          <div className="h-9 w-1/3 animate-pulse rounded bg-surface" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-surface" />
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <MapSkeleton />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              className={`h-72 animate-pulse rounded-[14px] bg-surface ${i === 0 ? 'md:col-span-2' : ''}`}
              key={i}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
