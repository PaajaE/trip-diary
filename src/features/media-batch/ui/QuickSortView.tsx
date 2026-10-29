import { Layers, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  formatInstantDate,
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'
import { getViewerUrls } from '@/features/journey-workspace/lib/media-thumb'
import type { WorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import type { BatchActions } from '@/features/media-batch/api/use-batch-actions'
import {
  countOpen,
  dayIsDone,
  nextDayStart,
  stepOpen,
} from '@/features/media-batch/model/quick-sort'
import {
  NO_UPLOADERS,
  uploaderText,
  type UploaderModel,
} from '@/features/media-batch/model/uploaders'
import { relativeSharpness } from '@/features/media-batch/model/series'
import { MoveToSheet } from '@/features/media-batch/ui/MoveToSheet'
import { PhotoCompare } from '@/features/media-batch/ui/PhotoCompare'
import { QuickSortActions } from '@/features/media-batch/ui/QuickSortActions'
import {
  QUICK_SORT_CHIP,
  QuickSortAside,
} from '@/features/media-batch/ui/QuickSortAside'
import { QuickSortSummary } from '@/features/media-batch/ui/QuickSortSummary'
import { SeriesView } from '@/features/media-batch/ui/SeriesView'
import { useDialogFocus } from '@/features/media-batch/ui/use-dialog-focus'
import { useQuickSortKeys } from '@/features/media-batch/ui/use-quick-sort-keys'
import { useQuickSortSession } from '@/features/media-batch/ui/use-quick-sort-session'
import { useSwipe } from '@/features/media-batch/ui/use-swipe'

export interface QuickSortViewProps {
  actions: Pick<
    BatchActions,
    'done' | 'moveTo' | 'newStop' | 'revert' | 'star' | 'trash'
  >
  baseUrl: string
  /** The live unsorted list; sorted items leave it, the session keeps its own. */
  items: readonly MediaItem[]
  journeyId: string
  onClose: () => void
  /** Place names by place id; a stop without a name yet shows a lookup placeholder. */
  placeNames?: ReadonlyMap<string, string>
  returnFocusTo?: HTMLElement | null
  /** Stops for the suggestion and the "Změnit" sheet; null while loading. */
  tree: WorkspaceTree | null
  /** Shared journeys only: marks media uploaded by another member. */
  uploaders?: UploaderModel
}

const NO_PLACE_NAMES: ReadonlyMap<string, string> = new Map()

/**
 * "Rychlé třídění": one unsorted photo at a time, full screen. The primary
 * action files it into the suggested stop; trash, best and "sorted" are one tap
 * away; every step goes on a stack that Undo really reverts.
 */
export function QuickSortView({
  actions,
  baseUrl,
  items,
  journeyId,
  onClose,
  placeNames = NO_PLACE_NAMES,
  returnFocusTo = null,
  tree,
  uploaders = NO_UPLOADERS,
}: QuickSortViewProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  const {
    accept,
    canUndo,
    compare,
    continueSession,
    currentStop,
    done,
    donePhoto,
    elapsedMs,
    handled,
    hasSeries,
    id,
    index,
    isHandled,
    item,
    itemOf,
    keepFromSeries,
    lastDay,
    liveById,
    moveTo,
    navigate,
    newStop,
    openSeriesView,
    outcome,
    overlay,
    pool,
    requestExit,
    seriesOpen,
    session,
    setOverlay,
    skip,
    star,
    starPhoto,
    starToast,
    stops,
    suggestedStop,
    suggestion,
    summary,
    trash,
    trashOneFromSeries,
    trashPhoto,
    undo,
  } = useQuickSortSession({ actions, items, onClose, placeNames, tree })

  useQuickSortKeys({
    accept,
    compare,
    navigate,
    onClose,
    openSeriesView,
    overlay,
    requestExit,
    star,
    trash,
    undo,
  })

  useDialogFocus(rootRef, returnFocusTo)

  // Back to the dialog when a layer closes.
  useEffect(() => {
    if (overlay === 'none') rootRef.current?.focus({ preventScroll: true })
  }, [overlay])

  const swipe = useSwipe({
    enabled: () => !compare.zoomed,
    onSwipe: (direction) => {
      if (direction === 'up') trash()
      else if (direction === 'right') star()
      else if (direction === 'left') skip()
    },
  })

  // Preload the neighbours.
  const nextIdx = stepOpen(session.ids, handled, index, 1)
  const prevIdx = stepOpen(session.ids, handled, index, -1)
  const nextId = nextIdx === null ? undefined : session.ids[nextIdx]
  const prevId = prevIdx === null ? undefined : session.ids[prevIdx]
  useEffect(() => {
    for (const own of [prevId, nextId]) {
      const neighbour = own === undefined ? undefined : itemOf(own)
      if (neighbour === undefined) continue
      const url = getViewerUrls(neighbour, baseUrl).imageUrl
      if (url !== null) new Image().src = url
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemOf only reads the maps below
  }, [prevId, nextId, liveById, baseUrl])

  if (id === undefined || item === undefined) return null

  const zone = mediaDisplayZone(item, null)
  const when =
    item.capturedAt === null
      ? t('quickSort.noDate')
      : `${formatInstantDate(item.capturedAt, zone, locale)}, ${formatLocalTime(item.capturedAt, zone, locale)}`
  const coordinates =
    item.latitude !== null && item.longitude !== null
      ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
      : null
  const total = session.ids.length
  const handledCount = session.ids.filter((own) => handled.has(own)).length
  const percent = Math.round((handledCount / Math.max(1, total)) * 100)

  const stopTitleOf = (target: MediaItem): string | null => {
    if (tree === null || target.momentId === null) return null
    const found = stops.find((stop) => stop.id === target.momentId)
    return found === undefined ? null : found.title
  }
  const compareSharpness = relativeSharpness([
    item,
    ...(compare.partner === undefined ? [] : [compare.partner]),
    ...pool,
  ])

  // The suggestion block above names the stop; the button only says what happens.
  const acceptLabel =
    suggestion !== null && suggestedStop !== undefined
      ? t(item.momentId === null ? 'quickSort.fileHere' : 'quickSort.moveHere')
      : item.momentId !== null
        ? t('quickSort.keepThere')
        : t('quickSort.newStop')

  const outcomeLabel =
    outcome === 'trash'
      ? t('quickSort.handledTrash')
      : outcome === 'stop'
        ? t('quickSort.handledStop')
        : outcome === 'done'
          ? t('quickSort.handledDone')
          : null

  return createPortal(
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none"
      data-testid="quick-sort"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="flex min-h-0 flex-1 flex-col" inert={overlay !== 'none'}>
        <h2 className="sr-only" id={titleId}>
          {t('quickSort.title')}
        </h2>
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            aria-label={t('quickSort.exit')}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            type="button"
            onClick={requestExit}
          >
            <X aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <p
              aria-live="polite"
              className="text-sm tabular-nums"
              data-testid="quick-sort-progress"
            >
              {t('quickSort.progress', { current: index + 1, total })}
            </p>
            <div
              aria-label={t('quickSort.progressBar')}
              aria-valuemax={total}
              aria-valuemin={0}
              aria-valuenow={handledCount}
              className="mt-1 h-1 overflow-hidden rounded-full bg-white/20"
              role="progressbar"
            >
              <div
                className="h-full bg-action-keep"
                style={{ width: `${String(percent)}%` }}
              />
            </div>
          </div>
          {hasSeries ? (
            <button
              className={QUICK_SORT_CHIP}
              type="button"
              onClick={openSeriesView}
            >
              <Layers aria-hidden="true" size={16} />
              {t('quickSort.seriesChip', { count: seriesOpen.length })}
            </button>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div
            className="relative flex min-h-0 flex-1 flex-col px-2"
            data-testid="quick-sort-stage"
            {...swipe}
          >
            <PhotoCompare
              actions={{
                disabled: (target) =>
                  target.id === id
                    ? handled.has(target.id)
                    : handled.get(target.id) === 'trash',
                keepDisabled: (target) => handled.has(target.id),
                keep: donePhoto,
                star: starPhoto,
                trash: trashPhoto,
              }}
              api={compare}
              baseUrl={baseUrl}
              dimmed={isHandled}
              main={item}
              sharpness={compareSharpness}
              stopTitle={stopTitleOf}
              testId="quick-sort-compare"
            >
              {outcomeLabel === null ? null : (
                <p className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-3 py-1 text-xs">
                  {outcomeLabel}
                </p>
              )}
            </PhotoCompare>
          </div>

          <QuickSortAside
            coordinates={coordinates}
            currentStop={currentStop}
            isHandled={isHandled}
            suggestedStop={suggestedStop}
            suggestion={suggestion}
            uploader={uploaderText(t, uploaders, item.ownerId)}
            when={when}
            zone={zone}
            onChange={() => {
              setOverlay('change')
            }}
          />
        </div>

        <p
          className="hidden shrink-0 px-4 pb-1 pt-1 text-center text-xs text-white/60 [@media(hover:hover)_and_(pointer:fine)]:block"
          data-testid="quick-sort-keyboard-hints"
        >
          {t('quickSort.keyboardHints')}
        </p>

        {starToast ? (
          <p
            className="mx-3 shrink-0 rounded-2xl bg-action-star px-4 py-2 text-sm text-action-star-foreground"
            data-testid="quick-sort-star-toast"
            role="status"
          >
            {t('quickSort.starToast')}
          </p>
        ) : null}

        <QuickSortActions
          acceptLabel={acceptLabel}
          canUndo={canUndo}
          isHandled={isHandled}
          starred={item.starred}
          onAccept={accept}
          onDone={done}
          onStar={star}
          onTrash={trash}
          onUndo={undo}
        />
      </div>

      {overlay === 'series' ? (
        <SeriesView
          baseUrl={baseUrl}
          canUndo={canUndo}
          items={seriesOpen.flatMap((own) => {
            const found = itemOf(own)
            return found === undefined ? [] : [found]
          })}
          onClose={() => {
            setOverlay('none')
          }}
          onKeep={keepFromSeries}
          onStar={starPhoto}
          onTrash={trashOneFromSeries}
          onUndo={undo}
        />
      ) : null}

      {overlay === 'change' ? (
        <MoveToSheet
          baseUrl={baseUrl}
          items={[item]}
          stops={stops}
          onClose={() => {
            setOverlay('none')
          }}
          onNewStop={newStop}
          onPick={moveTo}
        />
      ) : null}

      {overlay === 'summary' ? (
        <QuickSortSummary
          dayDone={dayIsDone(session, handled, lastDay)}
          elapsedMs={elapsedMs}
          journeyId={journeyId}
          lastDay={lastDay}
          nextDayId={nextDayStart(session, handled, lastDay)}
          open={countOpen(session.ids, handled)}
          summary={summary}
          onClose={onClose}
          onContinue={continueSession}
        />
      ) : null}
    </div>,
    document.body,
  )
}
