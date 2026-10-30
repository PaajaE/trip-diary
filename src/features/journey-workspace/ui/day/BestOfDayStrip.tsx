import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { getThumbUrl } from '@/features/journey-workspace/lib/media-thumb'

/**
 * "Best photos of the day": a suggestion of 3-6 photos with one tap to mark
 * the ones not yet starred. Nothing is changed until the author taps.
 */
export function BestOfDayStrip({
  baseUrl,
  onMarkAll,
  onOpen,
  picks,
}: {
  baseUrl: string
  onMarkAll: (items: MediaItem[]) => void
  onOpen: (item: MediaItem, trigger: HTMLElement) => void
  picks: readonly MediaItem[]
}) {
  const { t } = useTranslation()
  if (picks.length === 0) return null
  const unmarked = picks.filter((item) => !item.starred)
  return (
    <section
      aria-label={t('dayDetail.bestOfDay.label')}
      className="mt-4 rounded-xl border border-border bg-surface p-3"
      data-testid="best-of-day"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t('dayDetail.bestOfDay.label')}
        </h3>
        {unmarked.length > 0 ? (
          <button
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
            data-testid="best-of-day-mark"
            type="button"
            onClick={() => {
              onMarkAll(unmarked)
            }}
          >
            <Star aria-hidden="true" className="size-4" />
            {t('dayDetail.bestOfDay.mark', { count: unmarked.length })}
          </button>
        ) : (
          <span className="text-sm text-muted">
            {t('dayDetail.bestOfDay.done')}
          </span>
        )}
      </div>
      <ul className="mt-2 grid grid-cols-3 gap-1.5 min-[760px]:grid-cols-6">
        {picks.map((item) => {
          const src = getThumbUrl(item, baseUrl)
          return (
            <li
              className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sunk"
              key={item.id}
            >
              <button
                aria-label={t('dayDetail.bestOfDay.open')}
                className="block h-full w-full"
                type="button"
                onClick={(event) => {
                  onOpen(item, event.currentTarget)
                }}
              >
                {src === null ? null : (
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={src}
                  />
                )}
              </button>
              {item.starred ? (
                <Star
                  aria-hidden="true"
                  className="absolute top-1 right-1 size-4 fill-current text-amber-400"
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
