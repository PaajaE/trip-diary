import type { PublicMedia } from '@trip-diary/core/public-journey'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveImage } from '@/entities/public-journey/lib/media-url'
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

const SWIPE_PX = 50

/** Warms the browser cache with the photos next to the open one. */
function preloadNeighbours(items: readonly PublicMedia[], index: number) {
  for (const delta of [1, -1]) {
    const neighbour = items[(index + delta + items.length) % items.length]
    const image = neighbour === undefined ? null : resolveImage(neighbour)
    if (image === null || neighbour === items[index]) continue
    const preload = new Image()
    preload.sizes = '100vw'
    if (image.srcSet !== '') preload.srcset = image.srcSet
    preload.src = image.src
  }
}

/**
 * Full-screen viewer for a list of photos/videos (controlled): counter,
 * caption, heart, arrows, swipe, Esc, preload of the neighbours; focus moves
 * into the dialog and returns to what opened it. Shows photos whole
 * (`object-contain`), so panoramas are seen uncropped only here.
 */
export function MediaLightbox({
  index,
  items,
  onClose,
  onIndexChange,
}: MediaLightboxProps) {
  const { t } = useTranslation()
  const open = index !== null
  const closeRef = useRef<HTMLButtonElement>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const step = useCallback(
    (delta: number) => {
      if (index === null || items.length === 0) return
      onIndexChange((index + delta + items.length) % items.length)
    },
    [index, items.length, onIndexChange],
  )
  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [open])
  useEffect(() => {
    if (index === null) return undefined
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
  useEffect(() => {
    if (index !== null) preloadNeighbours(items, index)
  }, [index, items])
  const current = index === null ? null : (items[index] ?? null)
  if (current === null || index === null) return null
  return (
    <div
      aria-label={t('publicJourney.mediaViewer')}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="dialog"
    >
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
        type="button"
        onClick={onClose}
      />
      <button
        aria-label={t('publicJourney.close')}
        className="absolute top-4 right-4 z-10 inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10"
        ref={closeRef}
        type="button"
        onClick={onClose}
      >
        <X />
      </button>
      <p
        aria-live="polite"
        className="absolute top-5 left-4 text-sm tabular-nums text-white/90"
        role="status"
      >
        {t('publicJourney.counter', {
          current: index + 1,
          total: items.length,
        })}
      </p>
      {items.length > 1 ? (
        <>
          <button
            aria-label={t('publicJourney.previous')}
            className="absolute left-2 z-10 inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10"
            type="button"
            onClick={() => {
              step(-1)
            }}
          >
            <ChevronLeft />
          </button>
          <button
            aria-label={t('publicJourney.next')}
            className="absolute right-2 z-10 inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/10"
            type="button"
            onClick={() => {
              step(1)
            }}
          >
            <ChevronRight />
          </button>
        </>
      ) : null}
      <figure
        className="relative flex max-h-full max-w-full touch-pan-y flex-col items-center gap-2 select-none [touch-action:pan-y_pinch-zoom]"
        // A dragged <img> would start a native drag and cancel the swipe.
        onDragStart={(event) => {
          event.preventDefault()
        }}
        onPointerCancel={() => {
          swipe.current = null
        }}
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={(event) => {
          const start = swipe.current
          swipe.current = null
          if (start === null) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
            step(dx < 0 ? 1 : -1)
          }
        }}
      >
        <PublicMediaView
          className="max-h-[78vh] w-auto max-w-full object-contain"
          media={current}
          playable
          priority
          sizes="100vw"
        />
        {current.caption !== null ? (
          <figcaption className="max-w-[60ch] text-center text-sm text-white">
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
