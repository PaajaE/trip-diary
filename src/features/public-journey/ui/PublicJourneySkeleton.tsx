import { MapSkeleton } from '@/features/public-journey/ui/LazyPublicJourneyMap'

/** Layout-matching placeholder: hero, map and cards reserve their final size. */
export function PublicJourneySkeleton() {
  return (
    <main aria-busy="true" className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <div className="aspect-[16/9] w-full animate-pulse rounded-lg bg-surface" />
      <div className="space-y-3">
        <div className="h-9 w-2/3 animate-pulse rounded bg-surface" />
        <div className="h-5 w-full animate-pulse rounded bg-surface" />
      </div>
      <MapSkeleton />
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div className="h-72 animate-pulse rounded-lg bg-surface" key={i} />
        ))}
      </div>
    </main>
  )
}
