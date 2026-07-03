import type { ComponentProps } from 'react'
import { JourneyMap } from '@/features/journeys/ui/JourneyMap'
import { useInViewOnce } from '@/shared/lib/use-in-view-once'

type DeferredJourneyMapProps = ComponentProps<typeof JourneyMap> & {
  sectionId: string
}

export function DeferredJourneyMap({
  className,
  sectionId,
  ...props
}: DeferredJourneyMapProps) {
  const visible = useInViewOnce(sectionId)

  if (!visible) {
    return (
      <div
        aria-hidden="true"
        className={
          className ??
          'reader-map-frame reader-map-frame--embedded h-[min(72vh,40rem)] w-full rounded-[1.75rem] border border-border bg-surface'
        }
      />
    )
  }

  return <JourneyMap {...props} className={className ?? 'mt-8 h-80 overflow-hidden rounded-lg border border-border sm:h-96'} />
}
