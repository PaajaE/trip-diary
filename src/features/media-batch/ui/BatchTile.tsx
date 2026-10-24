import { Check, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { cn } from '@/shared/lib/cn'

interface BatchTileProps {
  baseUrl: string
  item: MediaItem
  /** Click on the tile; `range` is true with Shift held. */
  onActivate: (item: MediaItem, trigger: HTMLElement, range: boolean) => void
  selected: boolean
  selecting: boolean
  /** "Uploaded by …" in a shared journey, for media of another member. */
  uploader?: string | null
}

/** One media tile: opens the viewer, or toggles the selection in select mode. */
export function BatchTile({
  baseUrl,
  item,
  onActivate,
  selected,
  selecting,
  uploader = null,
}: BatchTileProps) {
  const { t } = useTranslation()
  const label = t(selecting ? 'dayDetail.selectPhoto' : 'viewer.open')
  return (
    <button
      aria-label={uploader === null ? label : `${label}. ${uploader}`}
      aria-pressed={selecting ? selected : undefined}
      className={cn(
        'relative block aspect-square select-none min-h-11 w-full touch-manipulation overflow-hidden rounded-sm bg-surface transition-shadow hover:shadow-soft',
        selected && 'ring-3 ring-primary',
      )}
      data-media-id={item.id}
      data-testid="batch-tile"
      title={uploader ?? undefined}
      type="button"
      onClick={(event) => {
        onActivate(item, event.currentTarget, event.shiftKey)
      }}
    >
      <MediaThumb
        baseUrl={baseUrl}
        className={cn('h-full w-full', selected && 'opacity-80')}
        item={item}
      />
      {item.starred ? (
        <Star
          aria-hidden="true"
          className="absolute right-1 top-1 fill-amber-300 text-amber-300 drop-shadow"
          data-testid="starred-indicator"
          size={16}
        />
      ) : null}
      {selecting ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-white shadow',
            selected ? 'bg-primary text-white' : 'bg-black/35',
          )}
        >
          {selected ? <Check size={14} strokeWidth={3} /> : null}
        </span>
      ) : null}
    </button>
  )
}
