import { Link } from '@tanstack/react-router'
import type { PublicMedia } from '@trip-diary/core/public-journey'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'

export interface StageLegendItem {
  color: string
  /** "23.–27. 7. · 5 dní" */
  detail: string
  id: string
  mediaCount: number
  thumb: PublicMedia | null
  title: string
}

interface StageLegendProps {
  items: readonly StageLegendItem[]
  journeySlug: string
  spaceHandle: string
}

/** Stage list beside the map: round thumbnail ringed in the stage colour. */
export function StageLegend({
  items,
  journeySlug,
  spaceHandle,
}: StageLegendProps) {
  return (
    <ol className="max-h-[28rem] space-y-1 overflow-y-auto">
      {items.map((item, index) => (
        <li key={item.id}>
          <Link
            className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-sunk"
            data-stage-id={item.id}
            params={{ journeySlug, segmentId: item.id, spaceHandle }}
            to="/$spaceHandle/$journeySlug/e/$segmentId"
          >
            <span
              className="size-10 shrink-0 overflow-hidden rounded-full border-[3px] border-solid bg-sunk"
              style={{ borderColor: item.color }}
            >
              {item.thumb === null ? null : (
                <PublicMediaView
                  className="block size-full object-cover"
                  media={item.thumb}
                  sizes="40px"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {`${String(index + 1)}. ${item.title}`}
              </span>
              <span className="block truncate text-xs text-muted">
                {item.detail}
              </span>
            </span>
            <span className="text-xs tabular-nums text-muted">
              {item.mediaCount}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
