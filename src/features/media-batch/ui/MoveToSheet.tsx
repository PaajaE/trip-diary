import { ChevronLeft, ChevronRight, ImageOff, Plus } from 'lucide-react'
import { useEffect, useId, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { countsText } from '@/features/journey-workspace/lib/moment-labels'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import {
  moveSheetModel,
  type MoveSheetStop,
} from '@/features/media-batch/model/move-sheet'
import { cn } from '@/shared/lib/cn'

interface MoveToSheetProps {
  baseUrl: string
  /** Media being moved; the first one decides the neighbours and suggestion. */
  items: readonly MediaItem[]
  onClose: () => void
  onNewStop: () => void
  onPick: (stopId: string) => void
  stops: readonly MoveSheetStop[]
}

const FOCUSABLE =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
const BIG =
  'flex min-h-14 flex-1 touch-manipulation items-center justify-center gap-1 rounded-lg bg-primary px-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40'

/**
 * "Move to" bottom sheet. Rendered above the photo viewer (z-60 vs 50), so it
 * owns the keyboard while open: a capture listener on the document handles
 * Esc and Tab and keeps every key from reaching the viewer underneath.
 */
export function MoveToSheet({
  baseUrl,
  items,
  onClose,
  onNewStop,
  onPick,
  stops,
}: MoveToSheetProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  const model = useMemo(() => moveSheetModel(stops, items[0]), [stops, items])

  useEffect(() => {
    const opener = document.activeElement
    const node = rootRef.current
    node?.focus({ preventScroll: true })
    function onKeyDown(event: KeyboardEvent) {
      if (node === null) return
      // The viewer (or page) below must not see any key while the sheet is up.
      event.stopPropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (first === undefined || last === undefined) {
        event.preventDefault()
        return
      }
      const active = document.activeElement
      if (!node.contains(active) || active === node) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  const reason =
    model.unavailable === 'noStops'
      ? t('mediaBatch.noStops')
      : model.unavailable === 'noTime'
        ? t('mediaBatch.moveSheet.noTime')
        : null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
        data-testid="move-sheet-backdrop"
        onClick={onClose}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-2xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground shadow-soft outline-none"
        ref={rootRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="text-lg font-semibold" id={titleId}>
          {t('mediaBatch.moveSheet.title', { count: items.length })}
        </h2>
        <div className="flex gap-2">
          <button
            className={BIG}
            disabled={model.prevId === null}
            type="button"
            onClick={() => {
              if (model.prevId !== null) onPick(model.prevId)
            }}
          >
            <ChevronLeft aria-hidden="true" size={18} />
            {t('mediaBatch.moveSheet.previous')}
          </button>
          <button
            className={BIG}
            disabled={model.nextId === null}
            type="button"
            onClick={() => {
              if (model.nextId !== null) onPick(model.nextId)
            }}
          >
            {t('mediaBatch.moveSheet.next')}
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
        {reason === null ? null : (
          <p className="text-sm text-muted" data-testid="move-sheet-reason">
            {reason}
          </p>
        )}
        {stops.length === 0 ? null : (
          <ul
            aria-label={t('mediaBatch.moveSheet.stops')}
            className="space-y-1"
          >
            {stops.map((stop) => (
              <li key={stop.id}>
                <button
                  className={cn(
                    'flex min-h-16 w-full touch-manipulation items-center gap-3 rounded-lg border px-2 py-2 text-left hover:bg-surface',
                    stop.id === model.suggestedId
                      ? 'border-primary'
                      : 'border-border',
                  )}
                  type="button"
                  onClick={() => {
                    onPick(stop.id)
                  }}
                >
                  {stop.cover === null ? (
                    <span
                      aria-hidden="true"
                      className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-surface text-muted"
                      data-testid="move-sheet-placeholder"
                    >
                      <ImageOff size={18} />
                    </span>
                  ) : (
                    <MediaThumb
                      baseUrl={baseUrl}
                      className="size-12"
                      item={stop.cover}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {stop.title}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {stop.when}
                      {' · '}
                      {countsText(t, {
                        photos: stop.photoCount,
                        videos: stop.videoCount,
                      }) || t('mediaBatch.moveSheet.empty')}
                    </span>
                  </span>
                  {stop.id === model.suggestedId ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {t('mediaBatch.moveSheet.suggested')}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          className="flex min-h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-3 font-medium hover:bg-surface"
          type="button"
          onClick={onNewStop}
        >
          <Plus aria-hidden="true" size={18} />
          {t('mediaBatch.moveSheet.newFromSelection')}
        </button>
        <button
          className="min-h-11 touch-manipulation rounded-lg px-3 text-muted hover:bg-surface"
          type="button"
          onClick={onClose}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
