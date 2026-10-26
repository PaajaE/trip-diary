import { suggestStop } from '@trip-diary/core/automation'
import { Link } from '@tanstack/react-router'
import { Check, Layers, Star, Trash2, Undo2, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  formatDuration,
  formatInstantDate,
  browserZone,
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'
import { getViewerUrls } from '@/features/journey-workspace/lib/media-thumb'
import type { WorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import type { BatchActions } from '@/features/media-batch/api/use-batch-actions'
import { buildMoveStops } from '@/features/media-batch/model/move-sheet'
import {
  markStarHintSeen,
  starHintSeen,
} from '@/features/media-batch/model/star-hint'
import {
  advanceOpen,
  buildSession,
  comparePool,
  countOpen,
  dayIsDone,
  handledMap,
  lastSortedDay,
  nextDayStart,
  openSeries,
  outcomeOf,
  popAction,
  pushAction,
  dropAction,
  settleAction,
  skipTarget,
  stepOpen,
  summarize,
  undoable,
  type SortAction,
  type SortHistory,
} from '@/features/media-batch/model/quick-sort'
import {
  NO_UPLOADERS,
  uploaderText,
  type UploaderModel,
} from '@/features/media-batch/model/uploaders'
import { relativeSharpness } from '@/features/media-batch/model/series'
import { MoveToSheet } from '@/features/media-batch/ui/MoveToSheet'
import { PhotoCompare } from '@/features/media-batch/ui/PhotoCompare'
import { SeriesView } from '@/features/media-batch/ui/SeriesView'
import { usePhotoCompare } from '@/features/media-batch/ui/use-photo-compare'
import { cn } from '@/shared/lib/cn'
import { haptic, type HapticKind } from '@/shared/lib/haptics'
import { buttonVariants } from '@/shared/ui/button-variants'

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

type Overlay = 'none' | 'change' | 'series' | 'summary'

const NO_PLACE_NAMES: ReadonlyMap<string, string> = new Map()
/** How long the one-time ★ explanation stays on screen. */
const STAR_HINT_MS = 7000

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), video[controls], [href], [tabindex]:not([tabindex="-1"])'
/** Same threshold as the culling view. UNVERIFIED on a real device. */
const SWIPE_MIN_PX = 50
const REASON_KEYS = {
  inside: 'quickSort.reasonInside',
  near_place: 'quickSort.reasonNearPlace',
  near_time: 'quickSort.reasonNearTime',
} as const

/** Only measures how long the session took; never an event time. */
const msSince = (since: number): number => performance.now() - since

const BIG =
  'flex min-h-14 items-center justify-center gap-2 rounded-2xl px-3 text-base font-semibold disabled:opacity-40'

/**
 * "Rychlé třídění": one unsorted photo at a time, full screen. The primary
 * action files it into the suggested stop; trash, best and "sorted" are one tap
 * away; every step goes on a stack that Undo really reverts.
 */
/** Tactile feedback per step: trash is heavier, a whole series kept is a success. */
function feedbackFor(type: SortAction['type'], count: number): HapticKind {
  if (type === 'trash') return count > 1 ? 'success' : 'medium'
  if (type === 'done') return 'light'
  return 'success'
}

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
  const starHintId = useId()
  const summaryTitleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const summaryFocusRef = useRef<HTMLButtonElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const seq = useRef(0)

  // Fixed at start so the position does not jump while items leave the list.
  const [session] = useState(() => buildSession(items))
  // Only measures how long the session took; never an event time.
  const [startedAt] = useState(() => performance.now())
  const liveById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  )
  const itemOf = (id: string): MediaItem | undefined =>
    liveById.get(id) ?? session.byId.get(id)

  const [currentId, setCurrentId] = useState(session.ids[0])
  const [history, setHistory] = useState<SortHistory>([])
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [starToast, setStarToast] = useState(false)

  const handled = useMemo(() => handledMap(history), [history])
  const index = Math.max(
    0,
    session.ids.findIndex((id) => id === currentId),
  )
  const id = session.ids[index]
  const item = id === undefined ? undefined : itemOf(id)
  const outcome = id === undefined ? undefined : handled.get(id)
  const isHandled = outcome !== undefined

  // Compare + zoom, shared with the series view. The partner pool is the
  // photo's series (else its day neighbours), never a trashed photo.
  const pool = (
    id === undefined ? [] : comparePool(session, id, handled)
  ).flatMap((own) => {
    const found = itemOf(own)
    return found === undefined ? [] : [found]
  })
  const compare = usePhotoCompare(item, pool)

  const stops = useMemo(
    () =>
      tree === null
        ? []
        : buildMoveStops(tree, t, locale, placeNames, browserZone()),
    [tree, t, locale, placeNames],
  )
  const suggestion = useMemo(
    () =>
      item === undefined
        ? null
        : suggestStop(
            {
              capturedAt: item.capturedAt,
              latitude: item.latitude,
              longitude: item.longitude,
              momentId: item.momentId,
            },
            stops,
          ),
    [item, stops],
  )
  const suggestedStop =
    suggestion === null
      ? undefined
      : stops.find((stop) => stop.id === suggestion.stopId)
  const placedIn = item?.momentId ?? null
  const currentStop =
    placedIn === null ? undefined : stops.find((stop) => stop.id === placedIn)

  const seriesOpen = id === undefined ? [] : openSeries(session, id, handled)
  const hasSeries = seriesOpen.length >= 2
  const summary = useMemo(() => summarize(history), [history])
  const lastDay = lastSortedDay(session, history)

  const openSummary = () => {
    setElapsedMs(msSince(startedAt))
    setOverlay('summary')
  }
  const requestExit = () => {
    if (history.length === 0) onClose()
    else openSummary()
  }

  /**
   * Records a step at once (optimistic, dims the photo, moves on) and settles
   * it when the request is done; a failed request takes the step back.
   */
  const commit = (
    draft: Pick<SortAction, 'ids' | 'type'> &
      Partial<Pick<SortAction, 'momentId'>>,
    request: () => Promise<boolean>,
    after: 'advance' | { goTo: string },
    patch: () => { createdMomentId: string | null } | undefined = () =>
      undefined,
  ) => {
    seq.current += 1
    const step = seq.current
    const action: SortAction = { ...draft, pending: true, seq: step }
    haptic(feedbackFor(draft.type, draft.ids.length))
    setHistory((h) => pushAction(h, action))
    if (after === 'advance') {
      const next = new Map(handled)
      const sorted = outcomeOf(draft.type)
      if (sorted !== null) for (const own of draft.ids) next.set(own, sorted)
      const target = advanceOpen(session.ids, next, index)
      const targetId = target === null ? undefined : session.ids[target]
      if (targetId === undefined) openSummary()
      else setCurrentId(targetId)
    } else {
      setCurrentId(after.goTo)
    }
    void request().then((ok) => {
      setHistory((h) =>
        ok ? settleAction(h, step, patch() ?? {}) : dropAction(h, step),
      )
    })
  }

  // A (the current photo) is locked once handled. B only when trashed: a kept
  // B can still be starred or trashed in the same pass.
  const canAct = (
    target: MediaItem | undefined,
    keepsOnly = false,
  ): target is MediaItem =>
    target !== undefined &&
    (target.id === id || keepsOnly
      ? !handled.has(target.id)
      : handled.get(target.id) !== 'trash')
  /** Acts on A (the current photo, then moves on) or on B (stays on A). */
  const trashPhoto = (target: MediaItem | undefined) => {
    if (!canAct(target)) return
    commit(
      { ids: [target.id], type: 'trash' },
      () => actions.trash([target]),
      target.id === id ? 'advance' : { goTo: id ?? target.id },
    )
  }
  const starPhoto = (target: MediaItem | undefined) => {
    if (!canAct(target)) return
    seq.current += 1
    const action: SortAction = {
      ids: [target.id],
      seq: seq.current,
      type: target.starred ? 'unstar' : 'star',
    }
    haptic('light')
    setHistory((h) => pushAction(h, action))
    void actions.star([target])
    // One-time explanation after the very first ★ on this device.
    if (!target.starred && !starHintSeen()) {
      markStarHintSeen()
      setStarToast(true)
    }
  }
  const donePhoto = (target: MediaItem | undefined) => {
    if (!canAct(target, true)) return
    commit(
      { ids: [target.id], type: 'done' },
      () => actions.done([target]),
      target.id === id ? 'advance' : { goTo: id ?? target.id },
    )
  }
  const trash = () => {
    trashPhoto(item)
  }
  const star = () => {
    starPhoto(item)
  }
  const done = () => {
    donePhoto(item)
  }
  const moveTo = (momentId: string) => {
    if (item === undefined || isHandled) return
    setOverlay('none')
    commit(
      { ids: [item.id], momentId, type: 'moveTo' },
      () => actions.moveTo([item], momentId),
      'advance',
    )
  }
  const newStop = () => {
    if (item === undefined || isHandled) return
    setOverlay('none')
    let created: string | null = null
    commit(
      { ids: [item.id], type: 'newStop' },
      () =>
        actions.newStop([item], {
          onCreated: (momentId) => {
            created = momentId
          },
        }),
      'advance',
      () => ({ createdMomentId: created }),
    )
  }
  const accept = () => {
    if (suggestion !== null) moveTo(suggestion.stopId)
    // Already in a stop and nothing better: keep it there.
    else if (item !== undefined && item.momentId !== null) done()
    else newStop()
  }

  const navigate = (delta: 1 | -1) => {
    const target = stepOpen(session.ids, handled, index, delta)
    const targetId = target === null ? undefined : session.ids[target]
    if (targetId !== undefined) setCurrentId(targetId)
  }
  const skip = () => {
    const target = skipTarget(session.ids, handled, index)
    const targetId = target === null ? undefined : session.ids[target]
    if (targetId !== undefined) setCurrentId(targetId)
  }

  const top = undoable(history)
  const canUndo = top !== null
  const undo = () => {
    if (top === null) return
    haptic('light')
    setHistory((h) => popAction(h))
    setOverlay('none')
    const first = top.ids[0]
    if (first !== undefined) setCurrentId(first)
    if (top.type === 'star' || top.type === 'unstar') {
      const target = first === undefined ? undefined : itemOf(first)
      if (target !== undefined) void actions.star([target])
      return
    }
    const originals = top.ids.flatMap((own) => {
      const original = session.byId.get(own)
      return original === undefined ? [] : [original]
    })
    // Origins come from the session snapshot, taken before any step.
    void actions
      .revert({
        createdMomentId: top.createdMomentId ?? null,
        items: originals,
        kind: top.type,
      })
      .then((ok) => {
        if (!ok) setHistory((h) => pushAction(h, top))
      })
  }

  const openSeriesView = () => {
    if (hasSeries) setOverlay('series')
  }
  const keepFromSeries = (keepIds: string[], trashIds: string[]) => {
    setOverlay('none')
    const keep = keepIds[0]
    if (trashIds.length === 0 || keep === undefined) return
    const gone = trashIds.flatMap((own) => {
      const found = itemOf(own)
      return found === undefined ? [] : [found]
    })
    commit({ ids: trashIds, type: 'trash' }, () => actions.trash(gone), {
      goTo: keep,
    })
  }

  /** Trashes one photo from inside the series view, which stays open. */
  const trashOneFromSeries = (target: MediaItem) => {
    if (!canAct(target)) return
    const rest = seriesOpen.filter((own) => own !== target.id)
    const goTo = id !== undefined && rest.includes(id) ? id : rest[0]
    if (goTo === undefined) return
    if (rest.length < 2) setOverlay('none')
    commit({ ids: [target.id], type: 'trash' }, () => actions.trash([target]), {
      goTo,
    })
  }

  const continueSession = (targetId?: string) => {
    setOverlay('none')
    const fallback = session.ids.find((own) => !handled.has(own))
    const next = targetId ?? fallback
    if (next !== undefined) setCurrentId(next)
  }

  const latest = useRef({
    accept,
    compare,
    navigate,
    overlay,
    requestExit,
    star,
    trash,
    undo,
    onClose,
    openSeriesView,
  })
  useEffect(() => {
    latest.current = {
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
    }
  })

  useEffect(() => {
    if (!starToast) return
    const timer = window.setTimeout(() => {
      setStarToast(false)
    }, STAR_HINT_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [starToast])

  // Focus in, trap Tab inside the topmost layer, return focus, lock scroll.
  useEffect(() => {
    const opener = returnFocusTo ?? document.activeElement
    const node = rootRef.current
    node?.focus({ preventScroll: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || node === null) return
      const entries = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.closest('[inert]') === null,
      )
      const first = entries[0]
      const last = entries[entries.length - 1]
      if (first === undefined || last === undefined) return
      const active = document.activeElement
      if (
        !node.contains(active) ||
        (active instanceof HTMLElement && active.closest('[inert]') !== null)
      ) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [returnFocusTo])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      )
        return
      const now = latest.current
      if (now.overlay === 'series') return // the series view owns Esc
      if (now.overlay === 'summary') {
        if (event.key === 'Escape') {
          event.preventDefault()
          now.onClose()
        }
        return
      }
      // The "Move to" sheet owns every key (Esc included) while it is open.
      if (now.overlay === 'change') return
      const run = (fn: () => void, repeatable = false) => {
        event.preventDefault()
        if (event.repeat && !repeatable) return
        fn()
      }
      // Compare and zoom own C, Z, [ ], Tab and the first Esc presses.
      if (now.compare.handleKey(event)) {
        event.preventDefault()
        return
      }
      switch (event.key) {
        case 'Escape':
          run(now.requestExit)
          break
        case 'ArrowLeft':
          run(() => {
            now.navigate(-1)
          }, true)
          break
        case 'ArrowRight':
          run(() => {
            now.navigate(1)
          }, true)
          break
        case 's':
        case 'S':
          run(now.star)
          break
        case 'x':
        case 'X':
        case 'Delete':
          run(now.trash)
          break
        case 'Enter':
          // A focused button keeps its own Enter.
          if (
            target instanceof HTMLElement &&
            (target.tagName === 'BUTTON' || target.tagName === 'A')
          )
            return
          run(now.accept)
          break
        case 'u':
        case 'U':
          run(now.undo)
          break
        case 'g':
        case 'G':
          run(now.openSeriesView)
          break
        default:
          break
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  // Move focus into the layer that just opened; back to the dialog on close.
  useEffect(() => {
    if (overlay === 'summary') summaryFocusRef.current?.focus()
    else if (overlay === 'none') rootRef.current?.focus({ preventScroll: true })
  }, [overlay])

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
  const starLabel = t(item.starred ? 'quickSort.unstar' : 'quickSort.star')
  const open = countOpen(session.ids, handled)
  const nextDayId = nextDayStart(session, handled, lastDay)
  const dayDone = dayIsDone(session, handled, lastDay)
  const chip =
    'flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20'

  const stat = (label: string, value: number): ReactNode => (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )

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
            <button className={chip} type="button" onClick={openSeriesView}>
              <Layers aria-hidden="true" size={16} />
              {t('quickSort.seriesChip', { count: seriesOpen.length })}
            </button>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div
            className="relative flex min-h-0 flex-1 flex-col px-2"
            data-testid="quick-sort-stage"
            onTouchEnd={(event) => {
              const start = touchStart.current
              const end = event.changedTouches[0]
              touchStart.current = null
              if (compare.zoomed || start === null || end === undefined) return
              const dx = end.clientX - start.x
              const dy = end.clientY - start.y
              if (dy < -SWIPE_MIN_PX && Math.abs(dy) > Math.abs(dx) * 1.5) {
                trash()
              } else if (
                Math.abs(dx) >= SWIPE_MIN_PX &&
                Math.abs(dx) > Math.abs(dy) * 1.5
              ) {
                if (dx > 0) star()
                else skip()
              }
            }}
            onTouchStart={(event) => {
              const point = event.touches[0]
              // A second finger is a pinch, not a swipe.
              touchStart.current =
                point === undefined || event.touches.length > 1
                  ? null
                  : { x: point.clientX, y: point.clientY }
            }}
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

          <aside className="shrink-0 space-y-3 px-3 pt-2 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-white/10 lg:p-4">
            <p className="text-center text-xs text-white/70 lg:text-left">
              {[
                when,
                coordinates ?? t('quickSort.noLocation'),
                uploaderText(t, uploaders, item.ownerId),
              ]
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
                className={cn(chip, 'mt-2')}
                disabled={isHandled}
                type="button"
                onClick={() => {
                  setOverlay('change')
                }}
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

        <div className="flex shrink-0 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <button
            className={cn(
              BIG,
              'bg-action-keep text-action-keep-foreground hover:bg-action-keep-hover',
            )}
            disabled={isHandled}
            type="button"
            onClick={accept}
          >
            {acceptLabel}
          </button>
          <div className="flex gap-2">
            <button
              aria-label={t('quickSort.undo')}
              className={cn(BIG, 'w-16 shrink-0 bg-white/10 hover:bg-white/20')}
              disabled={!canUndo}
              type="button"
              onClick={undo}
            >
              <Undo2 aria-hidden="true" />
            </button>
            <button
              className={cn(
                BIG,
                'flex-1 bg-action-trash text-action-trash-foreground hover:bg-action-trash-hover',
              )}
              disabled={isHandled}
              type="button"
              onClick={trash}
            >
              <Trash2 aria-hidden="true" />
              {t('quickSort.trash')}
            </button>
            <button
              aria-describedby={starHintId}
              aria-pressed={item.starred}
              className={cn(
                BIG,
                'flex-1 bg-action-star text-action-star-foreground hover:bg-action-star-hover',
              )}
              disabled={isHandled}
              title={t('quickSort.starHint')}
              type="button"
              onClick={star}
            >
              <Star
                aria-hidden="true"
                className={item.starred ? 'fill-action-star-foreground' : ''}
              />
              {starLabel}
            </button>
            <span className="sr-only" id={starHintId}>
              {t('quickSort.starHint')}
            </span>
            <button
              className={cn(BIG, 'bg-white/10 text-sm hover:bg-white/20')}
              disabled={isHandled}
              title={t('quickSort.doneHint')}
              type="button"
              onClick={done}
            >
              <Check aria-hidden="true" size={18} />
              {t('quickSort.done')}
            </button>
          </div>
        </div>
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
        <div
          aria-labelledby={summaryTitleId}
          aria-modal="true"
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 p-6"
          data-testid="quick-sort-summary"
          role="dialog"
        >
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-background p-6 text-foreground">
            <h3
              className="text-center text-lg font-semibold"
              id={summaryTitleId}
            >
              {t(
                dayDone ? 'quickSort.summaryDayDone' : 'quickSort.summaryTitle',
              )}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-center">
              {stat(t('quickSort.summaryBest'), summary.starred)}
              {stat(t('quickSort.summaryTrashed'), summary.trashed)}
              {stat(t('quickSort.summaryStops'), summary.toStops)}
              {stat(t('quickSort.summaryDone'), summary.done)}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {t('quickSort.summaryElapsed', {
                time: formatDuration(elapsedMs),
              })}
            </p>
            <div className="flex flex-col gap-2">
              {lastDay === null ? null : (
                <Link
                  className={buttonVariants({ variant: 'primary' })}
                  params={{ date: lastDay, journeyId }}
                  to="/j/$journeyId/workspace/day/$date"
                >
                  {t('quickSort.writeNote')}
                </Link>
              )}
              {nextDayId === null ? null : (
                <button
                  className={buttonVariants({ variant: 'secondary' })}
                  type="button"
                  onClick={() => {
                    continueSession(nextDayId)
                  }}
                >
                  {t('quickSort.nextDay')}
                </button>
              )}
              {open > 0 && nextDayId === null ? (
                <button
                  className={buttonVariants({ variant: 'secondary' })}
                  type="button"
                  onClick={() => {
                    continueSession()
                  }}
                >
                  {t('quickSort.keepGoing')}
                </button>
              ) : null}
              <button
                className={buttonVariants({ variant: 'secondary' })}
                ref={summaryFocusRef}
                type="button"
                onClick={onClose}
              >
                {t('quickSort.backToBatch')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

/** Stop name; a placeholder while the place is looked up shows as a skeleton. */
function StopName({
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
