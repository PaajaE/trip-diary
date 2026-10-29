import { ChevronLeft, Maximize } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import type {
  SessionPhoto,
  SessionStop,
} from '@/features/journey-flow/model/sort-session'
import {
  previousStopId,
  splitPreview,
} from '@/features/journey-flow/model/stop-review'
import { dayHeading, joinFacts } from '@/features/journey-flow/ui/flow-format'
import type { SortScreenActions } from '@/features/journey-flow/ui/sort/sort-screen-types'
import { SortStopStrip } from '@/features/journey-flow/ui/sort/SortStopStrip'
import type { DaySortState } from '@/features/journey-flow/ui/use-day-sort'
import { cn } from '@/shared/lib/cn'

export const HEAD_BTN =
  'flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10'

/**
 * Top of the sorting screen: back to Kontrola, the day and "Krok 2 ze 2"
 * (wide screens), the stops of the day with the stop edits, full screen.
 */
export function SortHeader({
  actions,
  busy,
  day,
  expanded,
  onExpanded,
  onFullscreen,
  onOpenReview,
  photo,
  run,
  sort,
  stop,
}: {
  actions: SortScreenActions
  busy: boolean
  day: FlowDay
  expanded: boolean
  onExpanded: (open: boolean) => void
  onFullscreen: () => void
  onOpenReview: () => void
  photo: SessionPhoto
  /** Runs a structural write; `done` is announced when it succeeds. */
  run: (action: () => Promise<unknown>, done?: string) => void
  sort: DaySortState
  stop: SessionStop
}) {
  const { i18n, t } = useTranslation()
  const { model, view } = sort
  const heading = dayHeading(day.key, i18n.language)
  const preview = splitPreview(stop.stop, photo.item.id)
  const previous = previousStopId(day, stop.stop.id)
  return (
    <header className="relative z-30 shrink-0 space-y-1 px-1 pt-[max(0.375rem,env(safe-area-inset-top))] lg:px-4">
      <div className="hidden items-center gap-3 text-sm lg:flex">
        <button
          className="min-h-11 font-semibold text-white/85 hover:underline"
          type="button"
          onClick={onOpenReview}
        >
          {t('flow.sort.reviewLink')}
        </button>
        <span className="text-white/70">
          {joinFacts([heading, t('flow.sort.step')])}
        </span>
        <span className="flex-1" />
        <span className="font-semibold" data-testid="sort-progress">
          {t('flow.sort.progress', {
            done: view.doneStops,
            total: view.totalStops,
          })}
        </span>
      </div>
      <div className="flex items-start gap-0.5">
        <button
          aria-label={t('flow.sort.backToReview')}
          className={cn(HEAD_BTN, 'lg:hidden')}
          type="button"
          onClick={onOpenReview}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <SortStopStrip
          busy={busy}
          canCut={preview !== null}
          canMerge={previous !== null}
          current={stop}
          daySits={model.daySits && model.daySitsIds.length > 0}
          expanded={expanded}
          unassignedCount={model.unassignedCount}
          view={view}
          onCut={() => {
            if (preview !== null) {
              run(() => actions.splitStop(stop.stop.id, preview.at))
            }
          }}
          onDaySits={() => {
            run(() => actions.daySits(model), t('flow.sort.daySitsDone'))
          }}
          onDontKnow={onOpenReview}
          onExpanded={onExpanded}
          onMerge={() => {
            if (previous !== null) {
              run(() => actions.mergeWithPrevious(previous, stop.stop.id))
            }
          }}
          onPick={(stopId) => {
            const target = view.stops.find((s) => s.stop.id === stopId)
            const first =
              target?.photos.find((p) => p.state === 'open') ??
              target?.photos[0]
            if (first !== undefined) sort.go(first.item.id)
            onExpanded(false)
          }}
        />
        <button
          aria-label={t('flow.sort.fullscreen')}
          className={cn(HEAD_BTN, 'lg:hidden')}
          type="button"
          onClick={onFullscreen}
        >
          <Maximize aria-hidden="true" size={20} />
        </button>
      </div>
    </header>
  )
}
