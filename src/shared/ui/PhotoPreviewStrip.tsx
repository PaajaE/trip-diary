import { cn } from '@/shared/lib/cn'

export interface PhotoPreviewStripItem {
  alt: string
  id: string
  url: string
}

interface PhotoPreviewStripProps {
  className?: string
  onSelect: (photoId: string) => void
  overflowCount?: number
  overflowLabel?: string
  photos: PhotoPreviewStripItem[]
}

export function PhotoPreviewStrip({
  className,
  onSelect,
  overflowCount = 0,
  overflowLabel,
  photos,
}: PhotoPreviewStripProps) {
  if (photos.length === 0) {
    return null
  }

  const lastIndex = photos.length - 1

  return (
    <ul
      className={cn(
        'flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {photos.map((photo, index) => {
        const showOverflow = overflowCount > 0 && index === lastIndex
        return (
          <li
            className="relative size-16 shrink-0 overflow-hidden rounded-xl sm:size-[4.5rem]"
            key={photo.id}
          >
            <button
              aria-label={
                showOverflow && overflowLabel !== undefined
                  ? overflowLabel
                  : photo.alt
              }
              className="block size-full"
              onClick={() => {
                onSelect(photo.id)
              }}
              type="button"
            >
              <img
                alt=""
                className="size-full object-cover"
                decoding="async"
                loading="lazy"
                src={photo.url}
              />
              {showOverflow ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                  +{overflowCount}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
