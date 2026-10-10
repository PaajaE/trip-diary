import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { formatDuration } from '@/features/journey-workspace/lib/format-range'
import { getThumbUrl } from '@/features/journey-workspace/lib/media-thumb'

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
  const url = getThumbUrl(item, baseUrl)
  const isVideo = item.kind === 'video'
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-md bg-surface ${className}`}
      data-testid="media-thumb"
    >
      {url !== null ? (
        <img
          alt={item.caption ?? ''}
          className="h-full w-full object-cover"
          loading="lazy"
          src={url}
        />
      ) : null}
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
