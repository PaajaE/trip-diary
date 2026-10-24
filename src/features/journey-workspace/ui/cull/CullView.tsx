import {
  Check,
  ChevronLeft,
  ChevronRight,
  Star,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import {
  formatInstantDate,
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'
import { getViewerUrls } from '@/features/journey-workspace/lib/media-thumb'
import {
  advanceTarget,
  countStarred,
  dropAction,
  isVisible,
  nearestVisible,
  popAction,
  positionAmongVisible,
  pushAction,
  starActionFor,
  stepIndex,
  summarize,
  type CullAction,
  type CullEntry,
  type CullHistory,
  type CullSummary,
} from '@/features/journey-workspace/model/cull'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'

export interface CullViewProps {
  baseUrl: string
  /** Only the two edits the culling needs; the full WorkspaceEdits fits. */
  edits: Pick<WorkspaceEdits, 'toggleStar' | 'trashMedia'>
  /** Start position in `photos` (default 0). */
  initialIndex?: number
  /** Called on "Hotovo" / exit; receives the session summary. */
  onClose: (summary: CullSummary) => void
  /** The day's media in display order. Trashed ones may disappear from it. */
  photos: MediaItem[]
  /**
   * Restores trashed media (needed for the U key to undo a trash; the toast
   * Undo from trashMedia works regardless). Without it U only undoes stars.
   */
  restoreMedia?: (items: MediaItem[]) => Promise<boolean>
  /** Fallback zone (moment/day zone) for media without its own. */
  resolveZone?: (item: MediaItem) => string | null
  /** Element that gets focus back on close. */
  returnFocusTo?: HTMLElement | null
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), video[controls], [href], [tabindex]:not([tabindex="-1"])'
const SWIPE_MIN_PX = 50

export function CullView({
  baseUrl,
  edits,
  initialIndex = 0,
  onClose,
  photos,
  restoreMedia,
  resolveZone,
  returnFocusTo = null,
}: CullViewProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const titleId = useId()
  const noStarsId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const filmstripRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<HTMLButtonElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  // The session list is fixed at start: trashed photos leave `photos` but stay
  // here (dimmed) so the filmstrip does not jump and Undo has a place to go.
  const [snapshot] = useState(
    () => new Map(photos.map((photo) => [photo.id, photo])),
  )
  const sessionIds = useMemo(() => [...snapshot.keys()], [snapshot])
  const liveById = useMemo(
    () => new Map(photos.map((photo) => [photo.id, photo])),
    [photos],
  )

  const entries = useMemo<CullEntry[]>(
    () =>
      sessionIds.map((id) => {
        const live = liveById.get(id)
        return {
          id,
          starred: (live ?? snapshot.get(id))?.starred ?? false,
          trashed: live === undefined,
        }
      }),
    [sessionIds, liveById, snapshot],
  )

  const [currentId, setCurrentId] = useState(
    () =>
      sessionIds[Math.max(0, Math.min(initialIndex, sessionIds.length - 1))],
  )
  const [history, setHistory] = useState<CullHistory>([])
  const [filter, setFilter] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const index = Math.max(
    0,
    entries.findIndex((entry) => entry.id === currentId),
  )
  const entry = entries[index]
  const item =
    entry === undefined
      ? undefined
      : (liveById.get(entry.id) ?? snapshot.get(entry.id))
  const summary = summarize(history, entries)
  const starredTotal = countStarred(entries)

  const goTo = (target: number | null) => {
    const next = target === null ? undefined : entries[target]
    if (next !== undefined) setCurrentId(next.id)
  }
  const navigate = (delta: 1 | -1) => {
    goTo(stepIndex(entries, filter, index, delta))
  }

  const requestExit = () => {
    if (summaryOpen || history.length === 0) onClose(summary)
    else setSummaryOpen(true)
  }

  const act = (type: 'star' | 'trash') => {
    if (entry === undefined || item === undefined || entry.trashed) return
    const action: CullAction = {
      id: entry.id,
      type: type === 'trash' ? 'trash' : starActionFor(entry),
    }
    setHistory((h) => pushAction(h, action))
    const request =
      type === 'trash' ? edits.trashMedia([item]) : edits.toggleStar(item)
    void request.then((ok) => {
      if (!ok) setHistory((h) => dropAction(h, action))
    })
    if (type === 'trash' || autoAdvance) {
      const target = advanceTarget(entries, filter, index)
      if (target === null) {
        if (type === 'trash') setSummaryOpen(true)
      } else goTo(target)
    }
  }

  const lastAction = history[history.length - 1]
  const canUndo =
    lastAction !== undefined &&
    (lastAction.type !== 'trash' || restoreMedia !== undefined)
  const undo = () => {
    if (!canUndo) return
    const { action, history: rest } = popAction(history)
    if (action === null) return
    const target = liveById.get(action.id) ?? snapshot.get(action.id)
    if (target === undefined) return
    setHistory(rest)
    setSummaryOpen(false)
    setCurrentId(action.id)
    if (action.type === 'trash') {
      void restoreMedia?.([target])
    } else {
      void edits.toggleStar(target)
    }
  }

  const toggleFilter = () => {
    const next = !filter
    if (next && starredTotal === 0) return
    setFilter(next)
    goTo(nearestVisible(entries, next, index))
  }

  const latest = useRef({ act, navigate, requestExit, toggleFilter, undo })
  useEffect(() => {
    latest.current = { act, navigate, requestExit, toggleFilter, undo }
  })

  // Focus in, trap Tab, return focus, lock page scroll.
  useEffect(() => {
    const opener = returnFocusTo ?? document.activeElement
    const node = rootRef.current
    node?.focus({ preventScroll: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || node === null) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (first === undefined || last === undefined) return
      const active = document.activeElement
      if (!node.contains(active)) {
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
      const run = (fn: () => void, repeatable = false) => {
        event.preventDefault()
        if (event.repeat && !repeatable) return
        fn()
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
        case 'p':
        case 'P':
          run(() => {
            now.act('star')
          })
          break
        case 'x':
        case 'X':
        case 'Delete':
          run(() => {
            now.act('trash')
          })
          break
        case 'u':
        case 'U':
          run(now.undo)
          break
        case 'f':
        case 'F':
          run(now.toggleFilter)
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

  useEffect(() => {
    if (summaryOpen) doneRef.current?.focus()
  }, [summaryOpen])

  // Preload neighbours.
  const nextIdx = stepIndex(entries, filter, index, 1)
  const prevIdx = stepIndex(entries, filter, index, -1)
  const nextId = nextIdx === null ? undefined : entries[nextIdx]?.id
  const prevId = prevIdx === null ? undefined : entries[prevIdx]?.id
  useEffect(() => {
    for (const id of [prevId, nextId]) {
      const neighbour = id === undefined ? undefined : liveById.get(id)
      if (neighbour === undefined) continue
      const url = getViewerUrls(neighbour, baseUrl).imageUrl
      if (url !== null) new Image().src = url
    }
  }, [prevId, nextId, liveById, baseUrl])

  // Keep the active filmstrip thumbnail visible.
  useEffect(() => {
    const strip = filmstripRef.current
    const active = strip?.querySelector<HTMLElement>('[aria-current="true"]')
    if (strip === null || active === null || active === undefined) return
    strip.scrollLeft =
      active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
  }, [currentId])

  if (entry === undefined || item === undefined) return null

  const zone = mediaDisplayZone(item, resolveZone?.(item) ?? null)
  const { imageUrl, videoUrl } = getViewerUrls(item, baseUrl)
  const position = positionAmongVisible(entries, filter, index)
  const total = entries.filter((e) => isVisible(e, filter)).length
  const filterDisabled = !filter && starredTotal === 0
  const chip =
    'flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-40'
  const bigButton =
    'flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-semibold disabled:opacity-40'
  const navButton =
    'absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 disabled:hidden sm:flex'

  return createPortal(
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none"
      data-testid="cull-view"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <h2 className="sr-only" id={titleId}>
        {t('cull.title')}
      </h2>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          aria-label={t('cull.exit')}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          type="button"
          onClick={requestExit}
        >
          <X aria-hidden="true" />
        </button>
        <p
          aria-live="polite"
          className="min-w-0 flex-1 whitespace-nowrap text-xs tabular-nums sm:text-sm"
          data-testid="cull-counter"
        >
          {t('cull.counter', {
            current: position,
            starred: starredTotal,
            total,
          })}
        </p>
        <button
          aria-pressed={filter}
          className={cn(
            chip,
            filter && 'bg-amber-400 text-black hover:bg-amber-300',
          )}
          aria-describedby={filterDisabled ? noStarsId : undefined}
          disabled={filterDisabled}
          title={filterDisabled ? t('cull.noStarsYet') : undefined}
          type="button"
          onClick={toggleFilter}
        >
          <Star aria-hidden="true" size={16} />
          {t('cull.filterStarred')}
          {filter ? <Check aria-hidden="true" size={16} /> : null}
        </button>
        {filterDisabled ? (
          <span className="sr-only" id={noStarsId}>
            {t('cull.noStarsYet')}
          </span>
        ) : null}
        <button
          aria-pressed={autoAdvance}
          className={cn(chip, autoAdvance && 'bg-white/30')}
          type="button"
          onClick={() => {
            setAutoAdvance((value) => !value)
          }}
        >
          {t('cull.autoAdvance')}
          {autoAdvance ? <Check aria-hidden="true" size={16} /> : null}
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16"
        data-testid="cull-stage"
        onTouchEnd={(event) => {
          const start = touchStart.current
          const end = event.changedTouches[0]
          touchStart.current = null
          if (start === null || end === undefined) return
          const dx = end.clientX - start.x
          const dy = end.clientY - start.y
          if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5)
            return
          navigate(dx < 0 ? 1 : -1)
        }}
        onTouchStart={(event) => {
          const point = event.touches[0]
          touchStart.current =
            point === undefined ? null : { x: point.clientX, y: point.clientY }
        }}
      >
        {videoUrl !== null ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- travel videos have no caption tracks
          <video
            aria-label={item.caption ?? t('workspace.video')}
            className="max-h-full max-w-full object-contain"
            controls
            key={item.id}
            playsInline
            poster={imageUrl ?? undefined}
            preload="metadata"
            src={videoUrl}
          />
        ) : imageUrl !== null ? (
          <img
            alt={item.caption ?? ''}
            className={cn(
              'max-h-full max-w-full object-contain',
              entry.trashed && 'opacity-30',
            )}
            draggable={false}
            key={item.id}
            src={imageUrl}
          />
        ) : null}
        {item.starred ? (
          <Star
            aria-label={t('cull.starredBadge')}
            className="absolute right-4 top-2 fill-amber-400 text-amber-400"
            role="img"
          />
        ) : null}
        <button
          aria-label={t('cull.previous')}
          className={cn(navButton, 'left-2')}
          disabled={prevIdx === null}
          type="button"
          onClick={() => {
            navigate(-1)
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          aria-label={t('cull.next')}
          className={cn(navButton, 'right-2')}
          disabled={nextIdx === null}
          type="button"
          onClick={() => {
            navigate(1)
          }}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <p className="shrink-0 px-4 pt-1 text-center text-xs text-white/70">
        {item.capturedAt !== null
          ? `${formatInstantDate(item.capturedAt, zone, locale)}, ${formatLocalTime(item.capturedAt, zone, locale)}`
          : t('cull.noDate')}
      </p>

      <p
        className="hidden shrink-0 px-4 pb-1 text-center text-xs text-white/60 [@media(hover:hover)_and_(pointer:fine)]:block"
        data-testid="cull-keyboard-hints"
      >
        {t('cull.keyboardHints')}
      </p>

      <div
        aria-label={t('cull.filmstrip')}
        className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-3 py-2"
        ref={filmstripRef}
        role="group"
      >
        {entries.map((e, i) => {
          if (!isVisible(e, filter) && e.id !== entry.id && filter) return null
          const thumbItem = liveById.get(e.id) ?? snapshot.get(e.id)
          if (thumbItem === undefined) return null
          return (
            <button
              aria-current={e.id === entry.id}
              aria-label={t('cull.goTo', { n: i + 1, total: entries.length })}
              className={cn(
                'relative shrink-0 rounded-sm opacity-70 outline-offset-2 hover:opacity-100',
                e.trashed && 'opacity-25',
                e.id === entry.id &&
                  'opacity-100 outline outline-2 outline-white',
              )}
              data-state={
                e.trashed ? 'trashed' : e.starred ? 'starred' : 'plain'
              }
              key={e.id}
              type="button"
              onClick={() => {
                setCurrentId(e.id)
              }}
            >
              <MediaThumb
                baseUrl={baseUrl}
                className="h-12 w-12 sm:h-14 sm:w-14"
                item={thumbItem}
              />
              {e.starred && !e.trashed ? (
                <Star
                  aria-hidden="true"
                  className="absolute right-0.5 top-0.5 fill-amber-400 text-amber-400"
                  size={14}
                />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex shrink-0 gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
        <button
          aria-label={t('cull.undo')}
          className={cn(bigButton, 'max-w-20 bg-white/10 hover:bg-white/20')}
          disabled={!canUndo}
          type="button"
          onClick={undo}
        >
          <Undo2 aria-hidden="true" />
        </button>
        <button
          aria-label={t('cull.trash')}
          className={cn(bigButton, 'bg-red-600 hover:bg-red-500')}
          disabled={entry.trashed}
          type="button"
          onClick={() => {
            act('trash')
          }}
        >
          <Trash2 aria-hidden="true" />
          {t('cull.trash')}
        </button>
        <button
          aria-label={t(item.starred ? 'cull.unstar' : 'cull.star')}
          aria-pressed={item.starred}
          className={cn(
            bigButton,
            'bg-amber-400 text-black hover:bg-amber-300',
          )}
          disabled={entry.trashed}
          type="button"
          onClick={() => {
            act('star')
          }}
        >
          <Star
            aria-hidden="true"
            className={item.starred ? 'fill-black' : ''}
          />
          {t(item.starred ? 'cull.unstar' : 'cull.star')}
        </button>
      </div>

      {summaryOpen ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/85 p-6"
          data-testid="cull-summary"
        >
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-background p-6 text-center text-foreground">
            <p className="text-lg font-semibold">
              {t('cull.summary', {
                starred: summary.starred,
                trashed: summary.trashed,
              })}
            </p>
            <div className="flex gap-2">
              <button
                className="min-h-11 flex-1 rounded-xl border border-border px-4 hover:bg-surface"
                type="button"
                onClick={() => {
                  setSummaryOpen(false)
                }}
              >
                {t('cull.keepGoing')}
              </button>
              <button
                ref={doneRef}
                className="min-h-11 flex-1 rounded-xl bg-primary px-4 font-semibold text-white"
                type="button"
                onClick={() => {
                  onClose(summary)
                }}
              >
                {t('cull.done')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
