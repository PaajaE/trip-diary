import { Check, ChevronDown, Merge, Scissors } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  SessionStop,
  SessionView,
} from '@/features/journey-flow/model/sort-session'
import { stopNameText } from '@/features/journey-workspace/lib/moment-labels'
import { cn } from '@/shared/lib/cn'

export interface SortStopStripProps {
  busy: boolean
  /** "Řez před touto fotkou" is possible at the current photo. */
  canCut: boolean
  canMerge: boolean
  current: SessionStop
  /** "Den sedí" is offered (every stop looks sure, nothing unplaced). */
  daySits: boolean
  expanded: boolean
  onCut: () => void
  onDaySits: () => void
  onDontKnow: () => void
  onExpanded: (open: boolean) => void
  onMerge: () => void
  onPick: (stopId: string) => void
  unassignedCount: number
  view: SessionView
}

const ROW =
  'flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold hover:bg-white/10 disabled:opacity-40'

/**
 * The stops of the day in one compact line: on a phone the current stop
 * with a progress dot per stop ("4 z 12") that expands to every stop and
 * the stop edits; on a wide screen the stops sit side by side as chips.
 */
export function SortStopStrip({
  busy,
  canCut,
  canMerge,
  current,
  daySits,
  expanded,
  onCut,
  onDaySits,
  onDontKnow,
  onExpanded,
  onMerge,
  onPick,
  unassignedCount,
  view,
}: SortStopStripProps) {
  const { i18n, t } = useTranslation()
  const panelId = useId()
  const nameOf = (stop: SessionStop) =>
    stopNameText(stop.stop.name, t, i18n.language).text
  const progress = t('flow.sort.progress', {
    done: view.doneStops,
    total: view.totalStops,
  })

  return (
    <div className="min-w-0 flex-1">
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        aria-label={t('flow.sort.stopsToggle', {
          done: view.doneStops,
          name: nameOf(current),
          number: current.number,
          total: view.totalStops,
        })}
        className="flex min-h-11 w-full min-w-0 flex-col gap-1.5 rounded-xl px-1.5 py-1 text-left lg:hidden"
        data-testid="sort-stop-toggle"
        type="button"
        onClick={() => {
          onExpanded(!expanded)
        }}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">
            {current.number} · {nameOf(current)}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('shrink-0', expanded && 'rotate-180')}
            size={14}
          />
          <span className="flex-1" />
          <span className="shrink-0 text-[13px] font-semibold text-white/80">
            {t('flow.sort.progressShort', {
              done: view.doneStops,
              total: view.totalStops,
            })}
          </span>
        </span>
        <span aria-hidden="true" className="flex w-full gap-0.5">
          {view.stops.map((stop) => (
            <span
              className={cn(
                'h-[3px] flex-1 rounded-sm',
                stop.done
                  ? 'bg-action-keep'
                  : stop.stop.id === current.stop.id
                    ? 'bg-white'
                    : 'bg-white/25',
              )}
              key={stop.stop.id}
            />
          ))}
        </span>
      </button>

      <ul
        aria-label={t('flow.sort.stopsLabel')}
        className="no-scrollbar hidden gap-1.5 overflow-x-auto lg:flex"
        data-testid="sort-stop-chips"
      >
        {view.stops.map((stop) => {
          const isCurrent = stop.stop.id === current.stop.id
          return (
            <li className="shrink-0" key={stop.stop.id}>
              <button
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={t('flow.sort.stopOpen', {
                  name: nameOf(stop),
                  number: stop.number,
                })}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold',
                  isCurrent
                    ? 'border-white bg-white text-black'
                    : 'border-white/20 text-white/85 hover:bg-white/10',
                )}
                type="button"
                onClick={() => {
                  onPick(stop.stop.id)
                }}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 rounded-full',
                    stop.done ? 'bg-action-keep' : 'bg-current opacity-40',
                  )}
                />
                {stop.done && !isCurrent
                  ? t('flow.sort.stopChipDone', { number: stop.number })
                  : t('flow.sort.stopChip', {
                      name: nameOf(stop),
                      number: stop.number,
                    })}
              </button>
            </li>
          )
        })}
        <li className="shrink-0">
          <button
            aria-controls={panelId}
            aria-expanded={expanded}
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 px-3 text-sm font-semibold text-white/85 hover:bg-white/10"
            type="button"
            onClick={() => {
              onExpanded(!expanded)
            }}
          >
            {t('flow.sort.stopEdits')}
            <ChevronDown
              aria-hidden="true"
              className={cn(expanded && 'rotate-180')}
              size={14}
            />
          </button>
        </li>
      </ul>

      {expanded ? (
        <div
          className="mt-1 space-y-2 rounded-2xl bg-white/10 p-2"
          data-testid="sort-stop-panel"
          id={panelId}
        >
          <p className="px-2 text-xs text-white/70" aria-live="polite">
            {progress}
          </p>
          <ul aria-label={t('flow.sort.stopsLabel')} className="lg:hidden">
            {view.stops.map((stop) => (
              <li key={stop.stop.id}>
                <button
                  aria-current={
                    stop.stop.id === current.stop.id ? 'true' : undefined
                  }
                  className={ROW}
                  type="button"
                  onClick={() => {
                    onPick(stop.stop.id)
                  }}
                >
                  {stop.done ? (
                    <Check
                      aria-hidden="true"
                      className="text-action-keep"
                      size={16}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="w-4 text-center text-white/60"
                    >
                      {stop.number}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {stop.number} · {nameOf(stop)}
                  </span>
                  <span className="shrink-0 text-xs text-white/70">
                    {stop.sorted}/{stop.total}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section aria-label={t('flow.sort.stopEdits')} className="space-y-1">
            <button
              className={ROW}
              disabled={busy || !canCut}
              type="button"
              onClick={onCut}
            >
              <Scissors aria-hidden="true" size={16} />
              {t('flow.sort.cutBefore')}
            </button>
            <button
              className={ROW}
              disabled={busy || !canMerge}
              type="button"
              onClick={onMerge}
            >
              <Merge aria-hidden="true" size={16} />
              {t('flow.sort.mergePrevious')}
            </button>
            {daySits ? (
              <button
                className={ROW}
                disabled={busy}
                type="button"
                onClick={onDaySits}
              >
                <Check aria-hidden="true" size={16} />
                <span className="min-w-0">
                  <span className="block">{t('flow.sort.daySits')}</span>
                  <span className="block text-xs font-normal text-white/70">
                    {t('flow.sort.daySitsHint')}
                  </span>
                </span>
              </button>
            ) : null}
            {unassignedCount > 0 ? (
              <button className={ROW} type="button" onClick={onDontKnow}>
                {t('flow.sort.dontKnowCount', { count: unassignedCount })}
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
