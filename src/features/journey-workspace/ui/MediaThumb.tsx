import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { formatDuration } from '@/features/journey-workspace/lib/format-range'
import { MediaImage } from '@/features/journey-workspace/ui/MediaImage'
import { cn } from '@/shared/lib/cn'

interface MediaThumbProps {
  baseUrl: string
  className?: string
  item: MediaItem
}

export function MediaThumb({
  baseUrl,
  className = 'h-16 w-16',
  item,
}: MediaThumbProps) {
  const { t } = useTranslation()
  const isVideo = item.kind === 'video'
  return (
    <span
      className={cn(
        'relative inline-block shrink-0 overflow-hidden rounded-sm bg-surface',
        className,
      )}
      data-testid="media-thumb"
    >
      <MediaImage
        alt={item.caption ?? ''}
        baseUrl={baseUrl}
        className="h-full w-full object-cover"
        item={item}
      />
      {isVideo ? (
        <span
          aria-label={t('workspace.video')}
          className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-1 text-[10px] text-white"
        >
          <span aria-hidden="true">{'▶'}</span>
          {item.durationMs !== null ? (
            <span>{formatDuration(item.durationMs)}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  )
}
