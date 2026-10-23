import { Link } from '@tanstack/react-router'
import type { PublicMedia } from '@trip-diary/core/public-journey'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'

interface StopRowProps {
  /** First line of the stop's text. */
  excerpt: string
  journeySlug: string
  momentId: string
  spaceHandle: string
  thumb: PublicMedia | null
  time: string
  title: string
}

/** A stop as a row: thumbnail, title, time, first line of the text. */
export function StopRow({
  excerpt,
  journeySlug,
  momentId,
  spaceHandle,
  thumb,
  time,
  title,
}: StopRowProps) {
  return (
    <Link
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2 hover:border-primary/40"
      params={{ journeySlug, momentId, spaceHandle }}
      to="/$spaceHandle/$journeySlug/m/$momentId"
    >
      <span className="size-10 shrink-0 overflow-hidden rounded-md bg-sunk">
        {thumb === null ? null : (
          <PublicMediaView
            className="block size-full object-cover"
            media={thumb}
            sizes="40px"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {excerpt === '' ? null : (
          <span className="block truncate text-xs text-muted">{excerpt}</span>
        )}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-faint">{time}</span>
    </Link>
  )
}
