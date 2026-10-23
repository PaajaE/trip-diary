import type { PublicMedia } from '@trip-diary/core/public-journey'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HeartButton } from '@/features/public-engagement/ui/HeartButton'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'

interface MediaGalleryProps {
  items: PublicMedia[]
  /** Square grid tiles (default) or natural-ratio tiles. */
  label?: string
}

interface MediaLightboxProps {
  items: readonly PublicMedia[]
  /** Open photo, or null when closed. */
  index: number | null
  onClose: () => void
  onIndexChange: (index: number) => void
}

/** Full-screen viewer for a list of photos/videos (controlled). */
export function MediaLightbox({
  index,
  items,
  onClose,
  onIndexChange,
}: MediaLightboxProps) {
  const { t } = useTranslation()
  const step = useCallback(
    (delta: number) => {
      if (index === null || items.length === 0) return
      onIndexChange((index + delta + items.length) % items.length)
    },
    [index, items.length, onIndexChange],
  )
  useEffect(() => {
    if (index === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [index, onClose, step])
  const current = index === null ? null : (items[index] ?? null)
  if (current === null) return null
  const close = onClose
  return (
    <div
      aria-label={t('publicJourney.mediaViewer')}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="dialog"
    >
      <button
        aria-label={t('publicJourney.close')}
        className="absolute top-4 right-4 text-white"
        onClick={close}
        type="button"
      >
        <X />
      </button>
      {items.length > 1 ? (
        <>
          <button
            aria-label={t('publicJourney.previous')}
            className="absolute left-3 text-white"
            onClick={() => {
              step(-1)
            }}
            type="button"
          >
            <ChevronLeft />
          </button>
          <button
            aria-label={t('publicJourney.next')}
            className="absolute right-3 text-white"
            onClick={() => {
              step(1)
            }}
            type="button"
          >
            <ChevronRight />
          </button>
        </>
      ) : null}
      <figure className="flex max-h-full max-w-full flex-col items-center gap-2">
        <PublicMediaView
          className="max-h-[80vh] w-auto max-w-full object-contain"
          media={current}
          playable
          priority
          sizes="100vw"
        />
        {current.caption !== null ? (
          <figcaption className="text-sm text-white">
            {current.caption}
          </figcaption>
        ) : null}
        <HeartButton
          inverse
          key={current.id}
          target={{ id: current.id, type: 'media' }}
        />
      </figure>
    </div>
  )
}

export function MediaGallery({ items, label }: MediaGalleryProps) {
  const { t } = useTranslation()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const close = useCallback(() => {
    setOpenIndex(null)
  }, [])

  if (items.length === 0) return null

  return (
    <>
      <ul
        aria-label={label}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        {items.map((media, index) => (
          <li className="relative" key={media.id}>
            <button
              aria-label={t('publicJourney.openMedia')}
              className="block aspect-square w-full overflow-hidden rounded-md bg-surface"
              onClick={() => {
                setOpenIndex(index)
              }}
              type="button"
            >
              <PublicMediaView
                className="h-full w-full object-cover"
                media={media}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              />
              {media.kind === 'video' ? (
                <Play
                  aria-hidden="true"
                  className="absolute right-2 bottom-2 size-6 rounded-full bg-black/60 p-1 text-white"
                />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <MediaLightbox
        index={openIndex}
        items={items}
        onClose={close}
        onIndexChange={setOpenIndex}
      />
    </>
  )
}
