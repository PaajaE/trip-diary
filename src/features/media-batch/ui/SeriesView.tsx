import { Check, Star, Undo2, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BestReason } from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import {
  recommendForSeries,
  relativeSharpness,
} from '@/features/media-batch/model/series'
import { PhotoCompare } from '@/features/media-batch/ui/PhotoCompare'
import { usePhotoCompare } from '@/features/media-batch/ui/use-photo-compare'
import { cn } from '@/shared/lib/cn'

export interface SeriesViewProps {
  baseUrl: string
  canUndo: boolean
  /** The still-unsorted photos of one series, in capture order. */
  items: readonly MediaItem[]
  /** "Keep all" / Esc / close. */
  onClose: () => void
  /** Keeps `keepIds` in the batch and trashes `trashIds`. */
  onKeep: (keepIds: string[], trashIds: string[]) => void
  /** ★ on one photo (B in the compare view too). */
  onStar: (item: MediaItem) => void
  /** Trashes one photo; the series view stays open. */
  onTrash: (item: MediaItem) => void
  onUndo: () => void
}

const REASON_KEYS: Record<BestReason, string> = {
  eyesOpen: 'series.reasonEyesOpen',
  goodExposure: 'series.reasonGoodExposure',
  sharpest: 'series.reasonSharpest',
  starred: 'series.reasonStarred',
}

const BIG =
  'flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold disabled:opacity-40'

/**
 * "Vyber tu nejlepší": a series of similar photos with the recommended one
 * large, a relative sharpness bar per thumbnail and a two-up compare. Rendered
 * inside the quick-sort dialog (which makes everything behind it inert).
 */
export function SeriesView({
  baseUrl,
  canUndo,
  items,
  onClose,
  onKeep,
  onStar,
  onTrash,
  onUndo,
}: SeriesViewProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const recommendation = useMemo(() => recommendForSeries(items), [items])
  const sharpness = useMemo(() => relativeSharpness(items), [items])
  const [mainId, setMainId] = useState(
    () => recommendation?.id ?? items[0]?.id ?? '',
  )
  const [many, setMany] = useState(false)
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const opener = document.activeElement
    rootRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  const main = items.find((item) => item.id === mainId) ?? items[0]
  const compare = usePhotoCompare(main, items)

  const latestClose = useRef(onClose)
  const latestCompare = useRef(compare)
  useEffect(() => {
    latestClose.current = onClose
    latestCompare.current = compare
  })
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
      if (latestCompare.current.handleKey(event)) {
        event.preventDefault()
        return
      }
      if (event.key !== 'Escape') return
      event.preventDefault()
      latestClose.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  if (main === undefined) return null

  const select = (id: string) => {
    if (many) {
      setKept((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
    if (id !== main.id) setMainId(id)
  }
  const keepPhoto = (target: MediaItem) => {
    setMany(true)
    setKept((current) => {
      const next = new Set(many ? current : [])
      if (next.has(target.id)) next.delete(target.id)
      else next.add(target.id)
      return next
    })
  }
  const startMany = () => {
    setMany(true)
    setKept(new Set([main.id]))
  }
  const keepIds = many
    ? items.filter((i) => kept.has(i.id)).map((i) => i.id)
    : [main.id]
  const trashIds = items.filter((i) => !keepIds.includes(i.id)).map((i) => i.id)
  const reasons = main.id === recommendation?.id ? recommendation.reasons : []

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="absolute inset-0 z-20 flex flex-col bg-black text-white outline-none"
      data-testid="series-view"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          aria-label={t('series.close')}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
        <h2 className="min-w-0 flex-1 text-lg font-semibold" id={titleId}>
          {t('series.title')}
        </h2>
        <button
          aria-label={t('series.undo')}
          className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
          disabled={!canUndo}
          type="button"
          onClick={onUndo}
        >
          <Undo2 aria-hidden="true" />
        </button>
      </div>

      <div
        className="flex shrink-0 flex-wrap gap-2 px-3 pb-2"
        data-testid="series-chips"
      >
        {main.id === recommendation?.id ? (
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200">
            {t('series.recommended')}
          </span>
        ) : null}
        {reasons.map((reason) => (
          <span
            className="rounded-full bg-white/15 px-3 py-1 text-xs"
            key={reason}
          >
            {t(REASON_KEYS[reason])}
          </span>
        ))}
        {many ? (
          <span className="px-1 py-1 text-xs text-white/70">
            {t('series.pickMany')}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2">
        <PhotoCompare
          actions={{
            keep: keepPhoto,
            kept: (target) => many && kept.has(target.id),
            star: onStar,
            trash: onTrash,
          }}
          api={compare}
          baseUrl={baseUrl}
          main={main}
          sharpness={sharpness}
          testId="series-stage"
        />
      </div>

      <ul
        aria-label={t('series.title')}
        className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-3 py-2"
      >
        {items.map((item, index) => {
          const rel = sharpness.get(item.id) ?? null
          const isMain = item.id === main.id
          const isKept = many && kept.has(item.id)
          return (
            <li className="shrink-0" key={item.id}>
              <button
                aria-label={t('series.photo', { n: index + 1 })}
                aria-pressed={many ? isKept : isMain}
                className={cn(
                  'relative block rounded-sm opacity-70 outline-offset-2 hover:opacity-100',
                  (isMain || isKept) &&
                    'opacity-100 outline outline-2 outline-white',
                )}
                data-selected={isMain || isKept}
                type="button"
                onClick={() => {
                  select(item.id)
                }}
              >
                <MediaThumb
                  baseUrl={baseUrl}
                  className="h-16 w-16 sm:h-20 sm:w-20"
                  item={item}
                />
                {item.starred ? (
                  <Star
                    aria-hidden="true"
                    className="absolute right-0.5 top-0.5 fill-amber-400 text-amber-400"
                    size={14}
                  />
                ) : null}
                {isKept ? (
                  <Check
                    aria-label={t('series.selected')}
                    className="absolute bottom-1 right-1 rounded-full bg-emerald-500 p-0.5"
                    role="img"
                    size={18}
                  />
                ) : null}
              </button>
              {rel === null ? null : (
                <div
                  aria-label={t('series.sharpness', {
                    percent: Math.round(rel * 100),
                  })}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.round(rel * 100)}
                  className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/20"
                  role="meter"
                >
                  <div
                    className="h-full bg-white/80"
                    style={{ width: `${String(Math.round(rel * 100))}%` }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex shrink-0 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:flex-row">
        {many ? (
          <button
            className={cn(BIG, 'flex-1 bg-emerald-700 hover:bg-emerald-600')}
            disabled={keepIds.length === 0}
            type="button"
            onClick={() => {
              onKeep(keepIds, trashIds)
            }}
          >
            {t('series.keepSelected', { count: keepIds.length })}
          </button>
        ) : (
          <button
            className={cn(BIG, 'flex-1 bg-emerald-700 hover:bg-emerald-600')}
            type="button"
            onClick={() => {
              onKeep(keepIds, trashIds)
            }}
          >
            {t('series.keepThis', { count: trashIds.length })}
          </button>
        )}
        {many ? null : (
          <button
            className={cn(BIG, 'bg-white/10 hover:bg-white/20')}
            type="button"
            onClick={startMany}
          >
            {t('series.keepMore')}
          </button>
        )}
        <button
          className={cn(BIG, 'bg-white/10 hover:bg-white/20')}
          type="button"
          onClick={onClose}
        >
          {t('series.keepAll')}
        </button>
      </div>
    </div>
  )
}
