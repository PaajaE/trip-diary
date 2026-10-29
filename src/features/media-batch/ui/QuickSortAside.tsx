import type { StopSuggestion } from '@trip-diary/core/automation'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MoveSheetStop } from '@/features/media-batch/model/move-sheet'
import { cn } from '@/shared/lib/cn'

const REASON_KEYS = {
  inside: 'quickSort.reasonInside',
  near_place: 'quickSort.reasonNearPlace',
  near_time: 'quickSort.reasonNearTime',
} as const

export const QUICK_SORT_CHIP =
  'flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20'

export interface QuickSortAsideProps {
  coordinates: string | null
  currentStop: MoveSheetStop | undefined
  isHandled: boolean
  onChange: () => void
  suggestedStop: MoveSheetStop | undefined
  suggestion: StopSuggestion | null
  uploader: string | null
  when: string
  zone: string | null
}

/** Stop name; a placeholder while the place is looked up shows as a skeleton. */
export function StopName({
  stop,
}: {
  stop: { pending: boolean; title: string }
}): ReactNode {
  return stop.pending ? (
    <span
      className="animate-pulse rounded-sm bg-white/10 px-1 text-white/70"
      data-testid="quick-sort-looking-up"
    >
      {stop.title}
    </span>
  ) : (
    stop.title
  )
}

/** Info line, the stop suggestion with "Změnit", and the desktop panel. */
export function QuickSortAside({
  coordinates,
  currentStop,
  isHandled,
  onChange,
  suggestedStop,
  suggestion,
  uploader,
  when,
  zone,
}: QuickSortAsideProps) {
  const { t } = useTranslation()
  return (
    <aside className="shrink-0 space-y-3 px-3 pt-2 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-white/10 lg:p-4">
      <p className="text-center text-xs text-white/70 lg:text-left">
        {[when, coordinates ?? t('quickSort.noLocation'), uploader]
          .filter((part) => part !== null)
          .join(' · ')}
      </p>
      <section
        aria-label={t('quickSort.suggestionTitle')}
        className="rounded-2xl bg-white/10 p-3"
        data-testid="quick-sort-suggestion"
      >
        <p className="text-xs uppercase tracking-wide text-white/60">
          {t('quickSort.suggestionTitle')}
        </p>
        {suggestion !== null && suggestedStop !== undefined ? (
          <>
            <p className="mt-1 font-semibold">
              <StopName stop={suggestedStop} />
            </p>
            <p className="text-sm text-white/70">
              {t(REASON_KEYS[suggestion.reason])}
            </p>
          </>
        ) : currentStop !== undefined ? (
          <p className="mt-1 text-sm text-white/70">
            {currentStop.pending
              ? t('quickSort.alreadyInUnknown')
              : t('quickSort.alreadyIn', { name: currentStop.title })}
          </p>
        ) : (
          <p className="mt-1 text-sm text-white/70">
            {t('quickSort.noSuggestion')}
          </p>
        )}
        <button
          className={cn(QUICK_SORT_CHIP, 'mt-2')}
          disabled={isHandled}
          type="button"
          onClick={onChange}
        >
          {t('quickSort.change')}
        </button>
      </section>

      <div className="hidden space-y-4 text-sm lg:block">
        <section aria-label={t('quickSort.panelFacts')}>
          <h3 className="text-xs uppercase tracking-wide text-white/60">
            {t('quickSort.panelFacts')}
          </h3>
          <dl className="mt-1 space-y-1">
            <div>
              <dt className="text-white/60">{t('quickSort.factTime')}</dt>
              <dd>{when}</dd>
            </div>
            <div>
              <dt className="text-white/60">{t('quickSort.factZone')}</dt>
              <dd>{zone ?? '—'}</dd>
            </div>
            {coordinates === null ? null : (
              <div>
                <dt className="text-white/60">
                  {t('quickSort.factCoordinates')}
                </dt>
                <dd>{coordinates}</dd>
              </div>
            )}
          </dl>
        </section>
        <section aria-label={t('quickSort.panelShortcuts')}>
          <h3 className="text-xs uppercase tracking-wide text-white/60">
            {t('quickSort.panelShortcuts')}
          </h3>
          <ul className="mt-1 space-y-0.5 text-white/80">
            <li>{t('quickSort.shortcutAccept')}</li>
            <li>{t('quickSort.shortcutStar')}</li>
            <li>{t('quickSort.shortcutStarWhy')}</li>
            <li>{t('quickSort.shortcutTrash')}</li>
            <li>{t('quickSort.shortcutUndo')}</li>
            <li>{t('quickSort.shortcutSeries')}</li>
            <li>{t('quickSort.shortcutCompare')}</li>
            <li>{t('quickSort.shortcutZoom')}</li>
            <li>{t('quickSort.shortcutFinish')}</li>
          </ul>
        </section>
      </div>
    </aside>
  )
}
