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

  const suggested = stops.find((stop) => stop.id === model.suggestedId)
  const groups = useMemo(() => {
    const out: { key: string; label: string; stops: MoveSheetStop[] }[] = []
    for (const stop of stops) {
      if (stop.id === model.suggestedId) continue
      const last = out[out.length - 1]
      if (last?.key === stop.dayKey) last.stops.push(stop)
      else out.push({ key: stop.dayKey, label: stop.dayLabel, stops: [stop] })
    }
    return out
  }, [stops, model.suggestedId])

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
        <button
          className="flex min-h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary px-3 font-medium hover:bg-surface"
          type="button"
          onClick={onNewStop}
        >
          <Plus aria-hidden="true" size={18} />
          <span className="min-w-0 truncate">
            {t('mediaBatch.moveSheet.newFromSelection')}
          </span>
          {model.newStopPlace === null ? null : (
            <span
              className="min-w-0 truncate text-sm text-muted"
              data-testid="move-sheet-new-place"
            >
              {t('mediaBatch.moveSheet.newStopAt', {
                place: model.newStopPlace,
              })}
            </span>
          )}
        </button>
        {suggested === undefined ? null : (
          <section
            aria-label={t('mediaBatch.moveSheet.suggestedSection')}
            data-testid="move-sheet-suggestion"
          >
            <StopRow
              baseUrl={baseUrl}
              current={suggested.id === model.currentId}
              stop={suggested}
              suggested
              onPick={onPick}
            />
          </section>
        )}
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
        {groups.length === 0 ? null : (
          <div aria-label={t('mediaBatch.moveSheet.stops')} role="group">
            {groups.map((group) => (
              <section className="mb-2" key={group.key}>
                <h3
                  className="sticky top-0 bg-background py-1 text-sm font-semibold text-muted"
                  data-testid="move-sheet-day"
                >
                  {group.label}
                </h3>
                <ul className="space-y-1">
                  {group.stops.map((stop) => (
                    <li key={stop.id}>
                      <StopRow
                        baseUrl={baseUrl}
                        current={stop.id === model.currentId}
                        stop={stop}
                        suggested={false}
                        onPick={onPick}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
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

/** One stop of the sheet: cover, name (or the lookup placeholder), time and counts. */
function StopRow({
  baseUrl,
  current,
  onPick,
  stop,
  suggested,
}: {
  baseUrl: string
  current: boolean
  onPick: (stopId: string) => void
  stop: MoveSheetStop
  suggested: boolean
}) {
  const { t } = useTranslation()
  return (
    <button
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex min-h-16 w-full touch-manipulation items-center gap-3 rounded-lg border px-2 py-2 text-left hover:bg-surface',
        suggested ? 'border-primary' : 'border-border',
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
        <MediaThumb baseUrl={baseUrl} className="size-12" item={stop.cover} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {stop.pending ? (
            <span
              className="animate-pulse rounded-sm bg-surface px-1 text-muted"
              data-testid="move-sheet-looking-up"
            >
              {stop.title}
            </span>
          ) : (
            stop.title
          )}
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
      {suggested ? (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {t('mediaBatch.moveSheet.suggested')}
        </span>
      ) : current ? (
        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
          {t('mediaBatch.moveSheet.current')}
        </span>
      ) : null}
    </button>
  )
}
