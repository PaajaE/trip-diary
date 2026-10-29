import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionStop } from '@/features/journey-flow/model/sort-session'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { cn } from '@/shared/lib/cn'

const DOT: Record<'keep' | 'trash', string> = {
  keep: 'bg-action-keep',
  trash: 'bg-action-trash',
}

/**
 * Compact filmstrip of the current stop: a dot per decision (nechat, koš),
 * suggested-trash photos faded. Every thumbnail is a 44 px button; on a
 * wide screen a short label sits under each.
 */
export function SortFilmstrip({
  baseUrl,
  currentId,
  onPick,
  stop,
}: {
  baseUrl: string
  currentId: string
  onPick: (photoId: string) => void
  stop: SessionStop
}) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      '[aria-current="true"]',
    )
    // jsdom has no scrollIntoView.
    if (typeof node?.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [currentId])
  return (
    <ul
      aria-label={t('flow.sort.photosLabel')}
      className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5"
      data-testid="sort-filmstrip"
      ref={listRef}
    >
      {stop.photos.map((photo, index) => {
        const current = photo.item.id === currentId
        const state = current ? 'current' : photo.state
        const stateText = t(`flow.sort.state.${state}`)
        const hint =
          photo.trashHint !== null && photo.state === 'open'
            ? t(`flow.sort.trashHint.${photo.trashHint}`)
            : null
        const label =
          hint === null
            ? t('flow.sort.photoLabel', { n: index + 1, state: stateText })
            : t('flow.sort.photoLabelHint', {
                n: index + 1,
                reason: hint,
                state: stateText,
              })
        const short =
          hint !== null && !current ? hint : t(`flow.sort.stateShort.${state}`)
        return (
          <li
            className="flex shrink-0 flex-col items-center"
            key={photo.item.id}
          >
            <button
              aria-current={current ? 'true' : undefined}
              aria-label={label}
              className="relative flex size-11 items-center justify-center rounded-md"
              data-state={photo.state}
              type="button"
              onClick={() => {
                onPick(photo.item.id)
              }}
            >
              <span
                className={cn(
                  'block size-9 overflow-hidden rounded-md',
                  current && 'outline outline-2 outline-white',
                  (photo.state === 'trash' || hint !== null) && 'opacity-40',
                )}
              >
                <MediaThumb
                  baseUrl={baseUrl}
                  className="size-9"
                  item={photo.item}
                />
              </span>
              {photo.state === 'keep' || photo.state === 'trash' ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute right-0.5 top-0.5 size-3 rounded-full border-2 border-black',
                    DOT[photo.state],
                  )}
                />
              ) : null}
            </button>
            <span
              aria-hidden="true"
              className="hidden max-w-16 truncate text-[11px] text-white/70 lg:block"
            >
              {short}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
