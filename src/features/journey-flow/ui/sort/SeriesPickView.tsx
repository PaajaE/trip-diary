import { Check, ChevronLeft, Star, Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  initialKeep,
  seriesNote,
  seriesOutcome,
  seriesStates,
  toggleKeep,
} from '@/features/journey-flow/model/series-pick'
import type { SessionPhoto } from '@/features/journey-flow/model/sort-session'
import { CompareDuelView } from '@/features/journey-flow/ui/sort/CompareDuelView'
import {
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { relativeSharpness } from '@/features/media-batch/model/series'
import { ignoredKey } from '@/features/media-batch/ui/sort-keys'
import { cn } from '@/shared/lib/cn'

export interface SeriesPickProps {
  baseUrl: string
  canUndo: boolean
  onClose: () => void
  /** The bulk action: keep these, trash the others. */
  onSettle: (keepIds: string[], trashIds: string[]) => void
  onStar: (id: string) => void
  onUndo: () => void
  /** The series in capture order (not trashed). */
  photos: readonly SessionPhoto[]
  starred: (id: string) => boolean
  /** "5 · Mistaya Canyon · 12:14–12:15". */
  subtitle: string
}

/**
 * Série (M-Serie, W-Serie): every photo of the series in a grid with the
 * recommended one pre-selected to keep. The mark in the corner switches
 * nechat / koš, a tap picks a photo for comparing. Nothing is written until
 * "Nechávám 2 ze 7, zbylých 5 půjde do koše".
 */
export function SeriesPickView({
  baseUrl,
  canUndo,
  onClose,
  onSettle,
  onStar,
  onUndo,
  photos,
  starred,
  subtitle,
}: SeriesPickProps) {
  const { i18n, t } = useTranslation()
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [keep, setKeep] = useState(() => initialKeep(photos))
  const [initial] = useState(() => initialKeep(photos))
  const [picks, setPicks] = useState<string[]>(() => {
    const first = [...initial][0] ?? photos[0]?.item.id
    const second = photos.find((p) => p.item.id !== first)?.item.id
    return [first, second].filter((id): id is string => id !== undefined)
  })
  const [comparing, setComparing] = useState(false)
  const sharpness = useMemo(
    () => relativeSharpness(photos.map((p) => p.item)),
    [photos],
  )
  const { keepIds, trashIds } = seriesOutcome(photos, keep)
  const unchanged =
    keep.size === initial.size && [...keep].every((id) => initial.has(id))

  const latestClose = useRef(onClose)
  const latestComparing = useRef(comparing)
  useEffect(() => {
    latestClose.current = onClose
    latestComparing.current = comparing
  })
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
    function onKeyDown(event: KeyboardEvent) {
      if (ignoredKey(event) || latestComparing.current) return
      if (event.key !== 'Escape') return
      event.preventDefault()
      latestClose.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const pick = (id: string) => {
    setPicks((current) =>
      current.includes(id)
        ? current.filter((own) => own !== id)
        : [...current, id].slice(-2),
    )
  }
  const bulkLabel =
    trashIds.length === 0
      ? t('flow.seriesPick.keepAll', { count: keepIds.length })
      : unchanged && keepIds.length === 1
        ? t('flow.seriesPick.keepRecommended')
        : t('flow.seriesPick.bulk', {
            count: trashIds.length,
            keep: keepIds.length,
            total: photos.length,
          })
  const [first, second] = picks

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="absolute inset-0 z-20 flex flex-col bg-black text-white outline-none"
      data-testid="series-pick"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="flex shrink-0 items-center gap-1 px-1 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <button
          aria-label={t('flow.seriesPick.back')}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10"
          type="button"
          onClick={onClose}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold" id={titleId}>
            {t('flow.seriesPick.title', { count: photos.length })}
          </h2>
          <p className="truncate text-xs text-white/70">{subtitle}</p>
        </div>
      </div>
      <p className="shrink-0 px-4 py-1.5 text-xs text-white/75">
        {t('flow.seriesPick.intro')}
      </p>

      <ul
        aria-label={t('flow.seriesPick.title', { count: photos.length })}
        className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(min(7.5rem,100%),1fr))] gap-2 overflow-y-auto px-3 py-1"
      >
        {photos.map((photo) => {
          const id = photo.item.id
          const kept = keep.has(id)
          const at = picks.indexOf(id)
          const zone = mediaDisplayZone(photo.item, null)
          const time =
            photo.item.capturedAt === null
              ? t('quickSort.noDate')
              : formatLocalTime(photo.item.capturedAt, zone, i18n.language)
          const note = seriesNote(photo, sharpness)
          const noteText =
            note === null ? null : t(`flow.seriesPick.note.${note}`)
          const label = [
            t('flow.seriesPick.photo', { time }),
            noteText,
            at === -1 ? null : t('flow.seriesPick.picked', { n: at + 1 }),
          ]
            .filter((part) => part !== null)
            .join(', ')
          return (
            <li className="relative min-w-0" data-photo-id={id} key={id}>
              <button
                aria-label={label}
                aria-pressed={at !== -1}
                className={cn(
                  'block w-full overflow-hidden rounded-xl',
                  at !== -1 &&
                    'outline outline-2 outline-offset-2 outline-white',
                  !kept && 'opacity-60',
                )}
                type="button"
                onClick={() => {
                  pick(id)
                }}
              >
                <MediaThumb
                  baseUrl={baseUrl}
                  className="aspect-square w-full"
                  item={photo.item}
                />
              </button>
              {at === -1 ? null : (
                <span
                  aria-hidden="true"
                  className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-white text-xs font-bold text-black"
                >
                  {at + 1}
                </span>
              )}
              {starred(id) ? (
                <Star
                  aria-hidden="true"
                  className="absolute bottom-8 left-1.5 fill-action-star text-action-star"
                  size={16}
                />
              ) : null}
              <button
                aria-label={
                  kept
                    ? t('flow.seriesPick.toTrash')
                    : t('flow.seriesPick.toKeep')
                }
                aria-pressed={kept}
                className="absolute right-0 top-0 flex size-11 items-center justify-center"
                data-testid="series-toggle"
                type="button"
                onClick={() => {
                  setKeep((current) => toggleKeep(current, id))
                }}
              >
                <span
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full border-2 border-black',
                    kept
                      ? 'bg-action-keep text-action-keep-foreground'
                      : 'bg-action-trash text-action-trash-foreground',
                  )}
                >
                  {kept ? (
                    <Check aria-hidden="true" size={14} />
                  ) : (
                    <Trash2 aria-hidden="true" size={14} />
                  )}
                </span>
              </button>
              <p className="mt-1 truncate text-xs text-white/80">
                {[time, noteText].filter((part) => part !== null).join(' · ')}
              </p>
            </li>
          )
        })}
      </ul>

      <div className="shrink-0 space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <p className="text-xs text-white/70">{t('flow.seriesPick.footnote')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="flex min-h-12 items-center justify-center rounded-2xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
            disabled={first === undefined || second === undefined}
            type="button"
            onClick={() => {
              setComparing(true)
            }}
          >
            {t('flow.seriesPick.compare')}
          </button>
          <button
            className="flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-action-keep px-4 text-base font-bold text-action-keep-foreground hover:bg-action-keep-hover disabled:opacity-40"
            disabled={keepIds.length === 0}
            type="button"
            onClick={() => {
              onSettle(keepIds, trashIds)
            }}
          >
            {bulkLabel}
          </button>
        </div>
      </div>

      {comparing && first !== undefined ? (
        <CompareDuelView
          backLabel={t('flow.duel.backToSeries')}
          baseUrl={baseUrl}
          canUndo={canUndo}
          challengerId={second ?? null}
          photos={photos}
          starred={starred}
          states={seriesStates(photos, keep)}
          winnerId={first}
          onClose={() => {
            setComparing(false)
          }}
          onKeep={(id) => {
            setKeep((current) => new Set(current).add(id))
          }}
          onStar={onStar}
          onTrash={(id) => {
            setKeep((current) => {
              const next = new Set(current)
              next.delete(id)
              return next
            })
          }}
          onUndo={onUndo}
        />
      ) : null}
    </div>
  )
}
