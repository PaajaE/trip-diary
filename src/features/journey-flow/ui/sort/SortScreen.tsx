import { ChevronLeft, Maximize, X } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import { buildDayEnd } from '@/features/journey-flow/model/day-sort'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import { seriesOf } from '@/features/journey-flow/model/sort-session'
import {
  previousStopId,
  splitPreview,
  timeFact,
} from '@/features/journey-flow/model/stop-review'
import {
  dayHeading,
  joinFacts,
  timeFactText,
} from '@/features/journey-flow/ui/flow-format'
import { DayEndView } from '@/features/journey-flow/ui/sort/DayEndView'
import { ShortcutsHint } from '@/features/journey-flow/ui/sort/ShortcutsHint'
import {
  SortDecisions,
  SortTools,
} from '@/features/journey-flow/ui/sort/SortControls'
import { SortFilmstrip } from '@/features/journey-flow/ui/sort/SortFilmstrip'
import {
  SortOverlays,
  type SortOverlay,
} from '@/features/journey-flow/ui/sort/SortOverlays'
import { SortStage } from '@/features/journey-flow/ui/sort/SortStage'
import { SortStopStrip } from '@/features/journey-flow/ui/sort/SortStopStrip'
import { useChrome } from '@/features/journey-flow/ui/sort/use-chrome'
import { useSortScreenKeys } from '@/features/journey-flow/ui/sort/use-sort-screen-keys'
import {
  useDaySort,
  type DaySortActions,
} from '@/features/journey-flow/ui/use-day-sort'
import { stopNameText } from '@/features/journey-workspace/lib/moment-labels'
import type { MoveSheetStop } from '@/features/media-batch/model/move-sheet'
import { FIT_VIEW } from '@/features/media-batch/model/zoom'
import { useDialogFocus } from '@/features/media-batch/ui/use-dialog-focus'
import { usePhotoCompare } from '@/features/media-batch/ui/use-photo-compare'
import { cn } from '@/shared/lib/cn'

export type SortScreenActions = DaySortActions &
  Pick<
    FlowActions,
    | 'createStopFromPhotos'
    | 'daySits'
    | 'mergeWithPrevious'
    | 'movePhotos'
    | 'splitStop'
  >

export interface SortScreenProps {
  actions: SortScreenActions
  baseUrl: string
  day: FlowDay
  /** Every day of the journey ("Další den"). */
  days: readonly FlowDay[]
  journeyId: string
  moveStops: readonly MoveSheetStop[]
  /** Kontrola zastávek of this day (back, "Nevím kam"). */
  onOpenReview: () => void
}

const HEAD_BTN =
  'flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10'

/**
 * Třídění po dnech, step 2 of 2 (M-Trideni, W-Trideni, M-TrideniCela,
 * W-BezRuseni): one big photo of the current stop, the stops of the day in
 * one line, Koš · Nechat · ★ Nejlepší with automatic advance and Undo, and
 * the filmstrip of the stop. Every action is a button; keys are an extra.
 */
export function SortScreen({
  actions,
  baseUrl,
  day,
  days,
  journeyId,
  moveStops,
  onOpenReview,
}: SortScreenProps) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const sort = useDaySort(day, actions)
  const { current, view } = sort
  const [overlay, setOverlay] = useState<SortOverlay | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const chrome = useChrome(fullscreen, true)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [ending, setEnding] = useState(sort.dayDone)
  const [wasDone, setWasDone] = useState(sort.dayDone)
  if (wasDone !== sort.dayDone) {
    setWasDone(sort.dayDone)
    if (sort.dayDone) setEnding(true)
  }
  const compare = usePhotoCompare(current?.photo.item, [])
  useDialogFocus(rootRef)

  const summary = useMemo(
    () => buildDayEnd(day, days, sort.trashedCount),
    [day, days, sort.trashedCount],
  )

  const run = (action: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setFailed(false)
    action().then(
      () => {
        setBusy(false)
        if (done !== undefined) setNotice(done)
      },
      () => {
        setBusy(false)
        setFailed(true)
      },
    )
  }

  const photo = current?.photo
  const stop = current?.stop
  const series = photo === undefined ? [] : seriesOf(view, photo.item.id)
  const openCompare = () => {
    if (photo === undefined || stop === undefined) return
    const pool =
      series.length >= 2
        ? series
        : stop.photos.filter((p) => p.state !== 'trash')
    if (pool.length < 2) return
    setOverlay({
      ids: pool.map((p) => p.item.id),
      kind: 'compare',
      winnerId: photo.item.id,
    })
  }
  const openSeries = () => {
    if (series.length >= 2) setOverlay({ kind: 'series', photos: series })
  }
  const openMove = () => {
    if (photo !== undefined) setOverlay({ item: photo.item, kind: 'move' })
  }
  const swipe = (direction: string) => {
    if (direction === 'up') sort.trash()
    else if (direction === 'left') sort.skip(1)
    else if (direction === 'right') sort.skip(-1)
  }

  useSortScreenKeys({
    best: () => {
      sort.best()
    },
    blocked: overlay !== null || ending || current === null,
    compare: openCompare,
    escape: () => {
      if (compare.zoomed) compare.setZoom(() => FIT_VIEW)
      else if (fullscreen) setFullscreen(false)
      else if (expanded) setExpanded(false)
      else return false
      return true
    },
    fullscreen: () => {
      setFullscreen((value) => !value)
    },
    keep: () => {
      sort.keep()
    },
    move: openMove,
    step: sort.skip,
    trash: () => {
      sort.trash()
    },
    undo: sort.undo,
    zoom: compare.cycle,
  })

  const heading = dayHeading(day.key, locale)
  const nameOf = (s: NonNullable<typeof stop>) =>
    stopNameText(s.stop.name, t, locale).text
  const range =
    stop === undefined
      ? ''
      : timeFactText(
          t,
          locale,
          timeFact(
            stop.stop.startsAt,
            stop.stop.endsAt,
            stop.total,
            stop.stop.tz,
          ),
        )
  const progress = t('flow.sort.progress', {
    done: view.doneStops,
    total: view.totalStops,
  })
  const decisions =
    photo === undefined ? null : (
      <SortDecisions
        compact={fullscreen}
        starred={sort.starred(photo.item.id)}
        state={photo.state}
        onBest={() => {
          sort.best()
        }}
        onKeep={() => {
          sort.keep()
        }}
        onTrash={() => {
          sort.trash()
        }}
      />
    )

  return createPortal(
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-40 flex flex-col bg-black text-white outline-none"
      data-testid="sort-screen"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
      onMouseMove={chrome.poke}
    >
      <h2 className="sr-only" id={titleId}>
        {joinFacts([heading, t('flow.sort.step')])}
      </h2>
      {ending ? (
        <DayEndView
          baseUrl={baseUrl}
          day={day}
          journeyId={journeyId}
          summary={summary}
          onBackToSorting={() => {
            setEnding(false)
          }}
        />
      ) : current === null || photo === undefined || stop === undefined ? (
        <div className="m-auto max-w-sm space-y-3 p-6 text-center">
          <p>{t('flow.sort.noPhotos')}</p>
          <button
            className="min-h-11 rounded-xl bg-white/10 px-4 font-semibold"
            type="button"
            onClick={onOpenReview}
          >
            {t('flow.sort.backToReview')}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" inert={overlay !== null}>
          {fullscreen ? null : (
            <header className="shrink-0 space-y-1 px-1 pt-[max(0.375rem,env(safe-area-inset-top))] lg:px-4">
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
                  {progress}
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
                  canCut={splitPreview(stop.stop, photo.item.id) !== null}
                  canMerge={previousStopId(day, stop.stop.id) !== null}
                  current={stop}
                  daySits={
                    sort.model.daySits && sort.model.daySitsIds.length > 0
                  }
                  expanded={expanded}
                  unassignedCount={sort.model.unassignedCount}
                  view={view}
                  onCut={() => {
                    const preview = splitPreview(stop.stop, photo.item.id)
                    if (preview !== null)
                      run(() => actions.splitStop(stop.stop.id, preview.at))
                  }}
                  onDaySits={() => {
                    run(
                      () => actions.daySits(sort.model),
                      t('flow.sort.daySitsDone'),
                    )
                  }}
                  onDontKnow={onOpenReview}
                  onExpanded={setExpanded}
                  onMerge={() => {
                    const previous = previousStopId(day, stop.stop.id)
                    if (previous !== null)
                      run(() =>
                        actions.mergeWithPrevious(previous, stop.stop.id),
                      )
                  }}
                  onPick={(stopId) => {
                    const target = view.stops.find((s) => s.stop.id === stopId)
                    const first =
                      target?.photos.find((p) => p.state === 'open') ??
                      target?.photos[0]
                    if (first !== undefined) sort.go(first.item.id)
                    setExpanded(false)
                  }}
                />
                <button
                  aria-label={t('flow.sort.fullscreen')}
                  className={cn(HEAD_BTN, 'lg:hidden')}
                  type="button"
                  onClick={() => {
                    setFullscreen(true)
                  }}
                >
                  <Maximize aria-hidden="true" size={20} />
                </button>
              </div>
            </header>
          )}

          {sort.error || failed || notice !== null ? (
            <p
              className={cn(
                'mx-3 mt-1 shrink-0 rounded-xl px-3 py-2 text-sm',
                sort.error || failed
                  ? 'bg-action-trash text-action-trash-foreground'
                  : 'bg-white/10',
              )}
              role={sort.error || failed ? 'alert' : 'status'}
            >
              {sort.error || failed ? t('flow.sort.error') : notice}
            </p>
          ) : null}

          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              !fullscreen && 'pt-1 lg:mx-auto lg:w-full lg:max-w-5xl lg:px-4',
            )}
          >
            {fullscreen ? null : (
              <div className="hidden shrink-0 items-end gap-3 pb-2 lg:flex">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold">
                    {stop.number} · {nameOf(stop)}
                  </p>
                  <p className="text-sm text-white/70">
                    {t('flow.sort.stopRange', {
                      index: current.index + 1,
                      range,
                      total: stop.total,
                    })}
                  </p>
                </div>
              </div>
            )}
            <SortStage
              baseUrl={baseUrl}
              compare={compare}
              fullscreen={fullscreen}
              index={current.index}
              photo={photo}
              seriesCount={series.length}
              stopDone={sort.stopDone}
              total={stop.total}
              onSeries={openSeries}
              onSwipe={swipe}
              {...(fullscreen ? { onTap: chrome.toggle } : {})}
            />
            {fullscreen ? (
              chrome.visible ? (
                <div className="absolute inset-x-0 bottom-0 space-y-2 bg-black/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                  <p className="text-center text-xs text-white/80">
                    {t('flow.sort.fullscreenHint')}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label={t('flow.sort.fullscreenExit')}
                      className={cn(HEAD_BTN, 'bg-white/10')}
                      type="button"
                      onClick={() => {
                        setFullscreen(false)
                      }}
                    >
                      <X aria-hidden="true" size={20} />
                    </button>
                    <div className="flex-1">{decisions}</div>
                  </div>
                  <ShortcutsHint
                    keys={['trash', 'keep', 'star', 'fullscreen', 'close']}
                  />
                </div>
              ) : (
                <button
                  aria-label={t('flow.sort.showControls')}
                  className="sr-only focus:not-sr-only"
                  type="button"
                  onClick={chrome.toggle}
                >
                  {t('flow.sort.showControls')}
                </button>
              )
            ) : (
              <>
                <SortTools
                  canCompare={
                    series.length >= 2 ||
                    stop.photos.filter((p) => p.state !== 'trash').length >= 2
                  }
                  canUndo={sort.canUndo}
                  zoomed={compare.zoomed}
                  onCompare={openCompare}
                  onFullscreen={() => {
                    setFullscreen(true)
                  }}
                  onMove={openMove}
                  onUndo={sort.undo}
                  onZoom={compare.cycle}
                />
                <div className="shrink-0 px-4 pt-1 lg:px-0">{decisions}</div>
                <p className="shrink-0 px-4 pt-1.5 text-xs leading-snug text-white/70 lg:px-0">
                  {t('flow.sort.starHint')}{' '}
                  <span className="hidden lg:inline">
                    {t('flow.sort.afterDecision')}
                  </span>
                </p>
                {sort.dayDone ? (
                  <button
                    className="mx-4 mt-2 min-h-11 shrink-0 rounded-xl bg-white/10 font-semibold"
                    type="button"
                    onClick={() => {
                      setEnding(true)
                    }}
                  >
                    {t('flow.sort.toDayEnd')}
                  </button>
                ) : null}
                <SortFilmstrip
                  baseUrl={baseUrl}
                  currentId={photo.item.id}
                  stop={stop}
                  onPick={sort.go}
                />
                <ShortcutsHint className="pb-2" />
              </>
            )}
          </div>
        </div>
      )}
      {overlay === null || stop === undefined ? null : (
        <SortOverlays
          baseUrl={baseUrl}
          moveStops={moveStops}
          overlay={overlay}
          sort={sort}
          subtitle={joinFacts([
            `${String(stop.number)} · ${nameOf(stop)}`,
            range,
          ])}
          onClose={() => {
            setOverlay(null)
          }}
          onMove={(item, stopId) => {
            setOverlay(null)
            sort.leave(item.id)
            run(() => actions.movePhotos([item.id], stopId))
          }}
          onNewStop={(item) => {
            setOverlay(null)
            sort.leave(item.id)
            run(() => actions.createStopFromPhotos([item.id]))
          }}
        />
      )}
    </div>,
    document.body,
  )
}
