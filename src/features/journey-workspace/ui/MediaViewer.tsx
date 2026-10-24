import { ChevronLeft, ChevronRight, Star, X } from 'lucide-react'
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
import type { CoverTarget } from '@/features/journey-workspace/model/cover-targets'
import { CaptionEditor } from '@/features/journey-workspace/ui/CaptionEditor'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'

/** Media of one moment (or the unassigned bucket) in viewing order. */
export interface ViewerGroup {
  id: string
  items: MediaItem[]
  title: string
  /** Resolved zone of the moment; fallback for media without a zone. */
  tz?: string | null
}

export interface MediaViewerProps {
  baseUrl: string
  edits: WorkspaceEdits
  /** Groups in journey document order; arrows continue across them. */
  groups: ViewerGroup[]
  locale: string
  onClose: () => void
  /**
   * Extension points for later phases. Each action (and its shortcut) is
   * rendered only when its callback is provided.
   */
  onDelete?: (item: MediaItem) => void
  onExtractToMoment?: (item: MediaItem) => void
  /** Opens the "fix time and location" sheet for the item. */
  onFixTimeLocation?: (item: MediaItem) => void
  onMoveToMoment?: (item: MediaItem) => void
  /** Element that gets focus back on close (the clicked tile). */
  returnFocusTo?: HTMLElement | null
  startId: string
  targets: ReadonlyMap<string, CoverTarget[]>
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), video[controls], [href], [tabindex]:not([tabindex="-1"])'
const SWIPE_MIN_PX = 50

interface FlatEntry {
  group: ViewerGroup
  item: MediaItem
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  )
}

export function MediaViewer({
  baseUrl,
  edits,
  groups,
  locale,
  onClose,
  onDelete,
  onExtractToMoment,
  onFixTimeLocation,
  onMoveToMoment,
  returnFocusTo = null,
  startId,
  targets,
}: MediaViewerProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const filmstripRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const [currentId, setCurrentId] = useState(startId)
  const [captionSignal, setCaptionSignal] = useState(0)

  const flat = useMemo<FlatEntry[]>(
    () =>
      groups.flatMap((group) => group.items.map((item) => ({ group, item }))),
    [groups],
  )
  // When the current item disappears (a later delete), stay at its position.
  const [fallbackIndex, setFallbackIndex] = useState(0)
  const found = flat.findIndex((entry) => entry.item.id === currentId)
  const index =
    found >= 0 ? found : Math.max(0, Math.min(fallbackIndex, flat.length - 1))
  const entry = flat[index]
  if (found >= 0 && found !== fallbackIndex) setFallbackIndex(found)
  // The current item vanished (trashed): adopt the neighbour that took its
  // place, so a later Undo does not pull the viewer back to the restored item.
  if (found < 0 && entry !== undefined) setCurrentId(entry.item.id)

  const stateRef = useRef({ entry, flat, index, onClose })
  useEffect(() => {
    stateRef.current = { entry, flat, index, onClose }
  })
  const actionsRef = useRef({ edits, onDelete, onMoveToMoment })
  useEffect(() => {
    actionsRef.current = { edits, onDelete, onMoveToMoment }
  })

  const go = (delta: number) => {
    const next = flat[index + delta]
    if (next !== undefined) setCurrentId(next.item.id)
  }

  useEffect(() => {
    if (entry === undefined) onClose()
  }, [entry, onClose])

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
      // Never scroll on focus: the page must stay where the user was. A tile
      // that was removed meanwhile (trashed) simply gets no focus.
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [returnFocusTo])

  // Keyboard shortcuts.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTyping(event.target)) return // the caption field owns its keys
      const { entry: current, flat: list, index: at } = stateRef.current
      const actions = actionsRef.current
      const step = (delta: number) => {
        event.preventDefault()
        const next = list[at + delta]
        if (next !== undefined) setCurrentId(next.item.id)
      }
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          stateRef.current.onClose()
          break
        case 'ArrowLeft':
          step(-1)
          break
        case 'ArrowRight':
          step(1)
          break
        case 's':
        case 'S':
          if (current === undefined) break
          event.preventDefault()
          void actions.edits.toggleStar(current.item)
          break
        case 'c':
        case 'C':
          event.preventDefault()
          setCaptionSignal((value) => value + 1)
          break
        case 'm':
        case 'M':
          if (current === undefined || actions.onMoveToMoment === undefined)
            break
          event.preventDefault()
          actions.onMoveToMoment(current.item)
          break
        case 'Delete':
          if (current === undefined || actions.onDelete === undefined) break
          event.preventDefault()
          actions.onDelete(current.item)
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

  // Preload the neighbouring photos so arrows feel instant.
  const prevItem = flat[index - 1]?.item
  const nextItem = flat[index + 1]?.item
  useEffect(() => {
    for (const neighbour of [prevItem, nextItem]) {
      if (neighbour === undefined) continue
      const url = getViewerUrls(neighbour, baseUrl).imageUrl
      if (url !== null) new Image().src = url
    }
  }, [prevItem, nextItem, baseUrl])

  // Keep the active filmstrip thumbnail visible.
  const activeId = entry?.item.id
  useEffect(() => {
    const strip = filmstripRef.current
    const active = strip?.querySelector<HTMLElement>('[aria-current="true"]')
    if (strip === null || active === null || active === undefined) return
    strip.scrollLeft =
      active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
  }, [activeId])

  if (entry === undefined) return null
  const { group, item } = entry
  const zone = mediaDisplayZone(item, group.tz ?? null)
  const { imageUrl, videoUrl } = getViewerUrls(item, baseUrl)
  const itemTargets = targets.get(item.id) ?? []
  const level = (target: CoverTarget) =>
    t(`terms.${target.level}.singular`).toLowerCase()
  const coverOf = itemTargets.filter(
    (target) => target.currentCoverId === item.id,
  )
  const navButton =
    'absolute top-1/2 z-10 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 disabled:hidden'

  return createPortal(
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none md:flex-row"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <h2 className="sr-only" id={titleId}>
        {t('viewer.title')}
      </h2>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-14 pt-[env(safe-area-inset-top)]"
          data-testid="viewer-stage"
          onTouchEnd={(event) => {
            const start = touchStart.current
            const end = event.changedTouches[0]
            touchStart.current = null
            if (start === null || end === undefined) return
            const dx = end.clientX - start.x
            const dy = end.clientY - start.y
            if (
              Math.abs(dx) < SWIPE_MIN_PX ||
              Math.abs(dx) < Math.abs(dy) * 1.5
            )
              return
            go(dx < 0 ? 1 : -1)
          }}
          onTouchStart={(event) => {
            const point = event.touches[0]
            touchStart.current =
              point === undefined
                ? null
                : { x: point.clientX, y: point.clientY }
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
              className="max-h-full max-w-full object-contain"
              draggable={false}
              key={item.id}
              src={imageUrl}
            />
          ) : null}
          <button
            aria-label={t('viewer.previous')}
            className={cn(navButton, 'left-2')}
            disabled={index === 0}
            type="button"
            onClick={() => {
              go(-1)
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            aria-label={t('viewer.next')}
            className={cn(navButton, 'right-2')}
            disabled={index === flat.length - 1}
            type="button"
            onClick={() => {
              go(1)
            }}
          >
            <ChevronRight aria-hidden="true" />
          </button>
          <button
            aria-label={t('viewer.close')}
            className="absolute left-2 top-[max(0.5rem,env(safe-area-inset-top))] z-10 flex size-11 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div
          aria-label={t('viewer.filmstrip')}
          className="flex shrink-0 gap-1.5 overflow-x-auto px-3 py-2"
          ref={filmstripRef}
          role="group"
        >
          {group.items.map((thumb, i) => (
            <button
              aria-current={thumb.id === item.id}
              aria-label={t('viewer.goTo', {
                n: i + 1,
                total: group.items.length,
              })}
              className={cn(
                'shrink-0 rounded-sm opacity-60 outline-offset-2 hover:opacity-100',
                thumb.id === item.id &&
                  'opacity-100 outline outline-2 outline-white',
              )}
              key={thumb.id}
              type="button"
              onClick={() => {
                setCurrentId(thumb.id)
              }}
            >
              <MediaThumb
                baseUrl={baseUrl}
                className="h-12 w-12 sm:h-14 sm:w-14"
                item={thumb}
              />
            </button>
          ))}
        </div>
      </div>
      <aside
        aria-label={t('viewer.panel')}
        className="max-h-[42dvh] shrink-0 space-y-3 overflow-y-auto bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground md:max-h-none md:w-80 md:pt-[max(1rem,env(safe-area-inset-top))]"
      >
        <div>
          <p className="font-medium" data-testid="viewer-moment">
            {group.title}
          </p>
          <p className="text-sm text-muted">
            {item.capturedAt !== null
              ? `${formatInstantDate(item.capturedAt, zone, locale)}, ${formatLocalTime(item.capturedAt, zone, locale)}`
              : t('viewer.noDate')}
          </p>
          <p
            aria-live="polite"
            className="text-xs text-muted"
            data-testid="viewer-position"
          >
            {t('viewer.position', { current: index + 1, total: flat.length })}
          </p>
        </div>
        <button
          aria-pressed={item.starred}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-medium hover:bg-surface"
          type="button"
          onClick={() => {
            void edits.toggleStar(item)
          }}
        >
          <Star
            aria-hidden="true"
            className={item.starred ? 'fill-amber-400 text-amber-400' : ''}
            size={18}
          />
          {t(item.starred ? 'workspace.unstar' : 'workspace.star')}
        </button>
        <CaptionEditor
          edits={edits}
          item={item}
          key={item.id}
          startSignal={captionSignal}
        />
        {coverOf.length > 0 ? (
          <p className="px-3 text-sm font-semibold text-primary">
            {t('workspace.coverBadge', {
              levels: coverOf.map(level).join(', '),
            })}
          </p>
        ) : null}
        <div
          aria-label={t('workspace.coverMenu')}
          className="flex flex-col"
          role="group"
        >
          {itemTargets.map((target) => {
            const current = target.currentCoverId === item.id
            return (
              <button
                className="min-h-11 rounded-xl px-3 text-left hover:bg-surface disabled:text-muted"
                disabled={current}
                key={target.level}
                type="button"
                onClick={() => {
                  void edits.setCover(item.id, target)
                }}
              >
                {current
                  ? t('workspace.coverCurrent', { level: level(target) })
                  : t('workspace.useAsCover', { level: level(target) })}
              </button>
            )
          })}
        </div>
        {onMoveToMoment !== undefined ||
        onExtractToMoment !== undefined ||
        onFixTimeLocation !== undefined ||
        onDelete !== undefined ? (
          <div
            aria-label={t('viewer.moreActions')}
            className="flex flex-col border-t border-border pt-2"
            role="group"
          >
            {onMoveToMoment !== undefined ? (
              <button
                className="min-h-11 rounded-xl px-3 text-left hover:bg-surface"
                type="button"
                onClick={() => {
                  onMoveToMoment(item)
                }}
              >
                {t('viewer.moveToMoment')}
              </button>
            ) : null}
            {onExtractToMoment !== undefined ? (
              <button
                className="min-h-11 rounded-xl px-3 text-left hover:bg-surface"
                type="button"
                onClick={() => {
                  onExtractToMoment(item)
                }}
              >
                {t('viewer.extractToMoment')}
              </button>
            ) : null}
            {onFixTimeLocation !== undefined ? (
              <button
                aria-haspopup="dialog"
                className="min-h-11 rounded-xl px-3 text-left hover:bg-surface"
                type="button"
                onClick={() => {
                  onFixTimeLocation(item)
                }}
              >
                {t('mediaCorrections.action')}
              </button>
            ) : null}
            {onDelete !== undefined ? (
              <button
                className="min-h-11 rounded-xl px-3 text-left text-destructive hover:bg-surface"
                type="button"
                onClick={() => {
                  onDelete(item)
                }}
              >
                {t('viewer.delete')}
              </button>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>,
    document.body,
  )
}
