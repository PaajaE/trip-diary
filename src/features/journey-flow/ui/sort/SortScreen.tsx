import { useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { buildDayEnd } from '@/features/journey-flow/model/day-sort'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import { seriesOf } from '@/features/journey-flow/model/sort-session'
import { timeFact } from '@/features/journey-flow/model/stop-review'
import {
  dayHeading,
  joinFacts,
  timeFactText,
} from '@/features/journey-flow/ui/flow-format'
import { DayEndView } from '@/features/journey-flow/ui/sort/DayEndView'
import { ShortcutsHint } from '@/features/journey-flow/ui/sort/ShortcutsHint'
import { stopTitle } from '@/features/journey-flow/ui/sort/sort-labels'
import type { SortScreenActions } from '@/features/journey-flow/ui/sort/sort-screen-types'
import {
  SortDecisions,
  SortTools,
} from '@/features/journey-flow/ui/sort/SortControls'
import { SortFilmstrip } from '@/features/journey-flow/ui/sort/SortFilmstrip'
import { SortFullscreenBar } from '@/features/journey-flow/ui/sort/SortFullscreenBar'
import { SortHeader } from '@/features/journey-flow/ui/sort/SortHeader'
import {
  SortOverlays,
  type SortOverlay,
} from '@/features/journey-flow/ui/sort/SortOverlays'
import { SortStage } from '@/features/journey-flow/ui/sort/SortStage'
import { useChrome } from '@/features/journey-flow/ui/sort/use-chrome'
import { useSortScreenKeys } from '@/features/journey-flow/ui/sort/use-sort-screen-keys'
import { useDaySort } from '@/features/journey-flow/ui/use-day-sort'
import type { MoveSheetStop } from '@/features/media-batch/model/move-sheet'
import { FIT_VIEW } from '@/features/media-batch/model/zoom'
import { useDialogFocus } from '@/features/media-batch/ui/use-dialog-focus'
import { usePhotoCompare } from '@/features/media-batch/ui/use-photo-compare'
import { cn } from '@/shared/lib/cn'

export type { SortScreenActions }

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

/**
 * Třídění po dnech, step 2 of 2 (M-Trideni, W-Trideni, M-TrideniCela,
 * W-BezRuseni): one big photo of the current stop, the stops of the day in
 * one line, Koš · Nechat · ★ Nejlepší with automatic advance and Undo, and
 * the filmstrip of the stop. Every action is a button; keys are an extra.
 * Swipe sideways like the compare view: left = next photo, right = back.
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
  const [ending, setEnding] = useState(sort.stopsDone)
  const [wasDone, setWasDone] = useState(sort.stopsDone)
  if (wasDone !== sort.stopsDone) {
    setWasDone(sort.stopsDone)
    if (sort.stopsDone) setEnding(true)
  }
  const compare = usePhotoCompare(current?.photo.item, [])
  useDialogFocus(rootRef)

  const { trashedIds } = sort
  const trashKey = [...trashedIds].sort().join(',')
  const summary = useMemo(
    () =>
      buildDayEnd(
        day,
        days,
        new Set(trashKey === '' ? [] : trashKey.split(',')),
      ),
    [day, days, trashKey],
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
  const comparePool =
    series.length >= 2
      ? series
      : (stop?.photos.filter((p) => p.state !== 'trash') ?? [])
  const openCompare = () => {
    if (photo === undefined || comparePool.length < 2) return
    setOverlay({
      ids: comparePool.map((p) => p.item.id),
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
  // Announced politely after every step (the region itself is always there).
  const live =
    current === null || stop === undefined
      ? ''
      : joinFacts([
          sort.stopDone === null
            ? null
            : t('flow.sort.stopDone', { number: sort.stopDone }),
          stopTitle(stop, t, locale),
          t('flow.sort.livePosition', {
            index: current.index + 1,
            total: stop.total,
          }),
        ])
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
  const showError = sort.error || failed

  return createPortal(
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-40 flex flex-col bg-black text-white outline-none"
      data-testid="sort-screen"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
      onPointerMove={chrome.onPointerMove}
    >
      <h2 className="sr-only" id={titleId}>
        {joinFacts([heading, t('flow.sort.step')])}
      </h2>
      <p
        aria-live="polite"
        className="sr-only"
        data-testid="sort-live"
        role="status"
      >
        {ending ? '' : live}
      </p>
      {ending ? (
        <DayEndView
          baseUrl={baseUrl}
          day={day}
          journeyId={journeyId}
          summary={summary}
          onBackToSorting={() => {
            setEnding(false)
          }}
          onOpenReview={onOpenReview}
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
        <div
          className="isolate flex min-h-0 flex-1 flex-col"
          inert={overlay !== null}
        >
          {fullscreen ? null : (
            <SortHeader
              actions={actions}
              busy={busy}
              day={day}
              expanded={expanded}
              photo={photo}
              run={run}
              sort={sort}
              stop={stop}
              onExpanded={setExpanded}
              onFullscreen={() => {
                setFullscreen(true)
              }}
              onOpenReview={onOpenReview}
            />
          )}
          {showError || notice !== null ? (
            <p
              className={cn(
                'mx-3 mt-1 shrink-0 rounded-xl px-3 py-2 text-sm',
                showError
                  ? 'bg-action-trash text-action-trash-foreground'
                  : 'bg-white/10',
              )}
              role={showError ? 'alert' : undefined}
            >
              {showError ? t('flow.sort.error') : notice}
            </p>
          ) : null}
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              !fullscreen && 'pt-1 lg:mx-auto lg:w-full lg:max-w-5xl lg:px-4',
            )}
          >
            {fullscreen ? null : (
              <div className="hidden shrink-0 pb-2 lg:block">
                <p className="truncate text-lg font-semibold">
                  {stopTitle(stop, t, locale)}
                </p>
                <p className="text-sm text-white/70">
                  {t('flow.sort.stopRange', {
                    index: current.index + 1,
                    range,
                    total: stop.total,
                  })}
                </p>
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
              onSwipe={(direction) => {
                if (direction === 'up') sort.trash()
                else if (direction === 'left') sort.skip(1)
                else if (direction === 'right') sort.skip(-1)
              }}
              {...(fullscreen ? { onTap: chrome.toggle } : {})}
            />
            {fullscreen ? (
              <SortFullscreenBar
                decisions={decisions}
                visible={chrome.visible}
                onClose={() => {
                  setFullscreen(false)
                }}
                onShow={chrome.show}
              />
            ) : (
              <>
                <SortTools
                  canCompare={comparePool.length >= 2}
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
                {sort.stopsDone ? (
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
          subtitle={joinFacts([stopTitle(stop, t, locale), range])}
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
