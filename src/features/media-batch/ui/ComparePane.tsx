import { Check, Star, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  formatInstantDate,
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'
import {
  buildMediaUrl,
  getViewerUrls,
  pickViewerImageVariant,
  pickZoomImageVariant,
} from '@/features/journey-workspace/lib/media-thumb'
import {
  fitScaleOf,
  fitSize,
  translateOf,
  viewForPane,
} from '@/features/media-batch/model/zoom'
import { usePaneSize } from '@/features/media-batch/ui/use-pane-size'
import { usePaneGestures } from '@/features/media-batch/ui/use-pane-gestures'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'
import type { SwipeHandlers } from '@/features/media-batch/ui/use-swipe'
import { cn } from '@/shared/lib/cn'

/** Actions of the compare view; they apply to the photo they are shown under. */
export interface PhotoCompareActions {
  disabled?: (item: MediaItem) => boolean
  keep: (item: MediaItem) => void
  /** Overrides `disabled` for Keep only (a kept photo can still be starred). */
  keepDisabled?: (item: MediaItem) => boolean
  /** aria-pressed of Keep (series: the photo is in the kept selection). */
  kept?: (item: MediaItem) => boolean
  star: (item: MediaItem) => void
  trash: (item: MediaItem) => void
}

const ICON_BASE =
  'flex size-11 items-center justify-center rounded-full disabled:opacity-40'
export const ICON_BTN = `${ICON_BASE} bg-white/10 text-white hover:bg-white/20`
const ICON_KEEP = `${ICON_BASE} bg-action-keep text-action-keep-foreground hover:bg-action-keep-hover`
const ICON_TRASH = `${ICON_BASE} bg-action-trash text-action-trash-foreground hover:bg-action-trash-hover`
const ICON_STAR = `${ICON_BASE} bg-action-star text-action-star-foreground hover:bg-action-star-hover`

export interface PaneProps {
  actions: PhotoCompareActions | undefined
  api: PhotoCompareApi
  baseUrl: string
  dimmed: boolean
  isMain: boolean
  item: MediaItem
  label: 'A' | 'B'
  sharpness: ReadonlyMap<string, number | null> | undefined
  showActions: boolean
  stopTitle: string | null
  /** Drawn over the photo (role badges such as "ponechaná"). */
  badge?: ReactNode
  /** No caption under the photo (the screen shows its own). */
  bare?: boolean
  /** Replaces the icon actions under the photo. */
  footer?: ReactNode
  /** Swipes on this photo (the compare duel: up trashes this one). */
  gestures?: SwipeHandlers
}

/** One photo of the compare view with pinch, drag, wheel and tap zoom. */
export function ComparePane({
  actions,
  api,
  baseUrl,
  dimmed,
  isMain,
  item,
  label,
  sharpness,
  showActions,
  stopTitle,
  badge = null,
  bare = false,
  footer = null,
  gestures,
}: PaneProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const viewport = useRef<HTMLDivElement>(null)
  const size = usePaneSize(viewport)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)

  const { videoUrl } = getViewerUrls(item, baseUrl)
  const fitVariant = pickViewerImageVariant(item)
  // Entering zoom swaps to the largest variant (`full`, else `large`).
  const zoomVariant = pickZoomImageVariant(item)
  const fitUrl =
    fitVariant === null ? null : buildMediaUrl(fitVariant.storageKey, baseUrl)
  const zoomUrl =
    zoomVariant === null ? null : buildMediaUrl(zoomVariant.storageKey, baseUrl)
  const shown = zoomVariant ?? fitVariant
  const pixelWidth = shown?.width ?? item.width ?? 0
  const pixelHeight = shown?.height ?? item.height ?? 0
  const aspect = pixelHeight > 0 ? pixelWidth / pixelHeight : 0
  // Stable while the pane and photo keep their size (no metrics per render).
  const fit = useMemo(() => fitSize(size, aspect), [size, aspect])
  const fitScale = fitScaleOf(fit, pixelWidth)
  const view = viewForPane(api.zoom, fit, size)
  const offset = translateOf(view, fit)
  const scale = view.k * fitScale

  const { reportMetrics } = api
  useEffect(() => {
    if (isMain) reportMetrics({ fit, fitScale, pane: size })
  }, [isMain, reportMetrics, fit, fitScale, size])

  const handlers = usePaneGestures({
    api,
    enabled: videoUrl === null,
    fit,
    fitScale,
    size,
    viewport,
  })

  const zone = mediaDisplayZone(item, null)
  const when =
    item.capturedAt === null
      ? t('quickSort.noDate')
      : `${formatInstantDate(item.capturedAt, zone, locale)} ${formatLocalTime(item.capturedAt, zone, locale)}`
  const rel = sharpness?.get(item.id) ?? null
  // Scale is relative to the loaded pixels; "≈" when that is a downsized copy.
  const approx =
    item.width !== null && pixelWidth > 0 && pixelWidth < item.width
  const percent = `${approx ? '≈ ' : ''}${String(Math.round(scale * 100))}`
  const scaleText = api.zoomed
    ? t('photoCompare.scale', { percent })
    : t('photoCompare.scaleFit', { percent })
  const details = [
    when,
    stopTitle,
    rel === null
      ? null
      : t('photoCompare.sharpness', { percent: Math.round(rel * 100) }),
    scaleText,
  ].filter((part): part is string => part !== null && part !== '')
  const disabled = actions?.disabled?.(item) ?? false
  const keepOff = actions?.keepDisabled?.(item) ?? disabled
  const which = t('photoCompare.which', { label })

  return (
    <figure
      className="flex min-h-0 min-w-0 flex-col"
      data-photo-id={item.id}
      data-testid="compare-pane"
      data-zoom={view.k.toFixed(3)}
      {...gestures}
    >
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          videoUrl === null && 'touch-none',
          api.zoomed && 'cursor-grab active:cursor-grabbing',
        )}
        ref={viewport}
        {...handlers}
      >
        {videoUrl !== null ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- travel videos have no caption tracks
          <video
            aria-label={item.caption ?? t('workspace.video')}
            className="size-full object-contain"
            controls
            key={item.id}
            playsInline
            poster={fitUrl ?? undefined}
            preload="metadata"
            src={videoUrl}
          />
        ) : fitUrl !== null ? (
          <div
            className="absolute inset-0 will-change-transform"
            style={{
              transform: `translate(${String(offset.x)}px, ${String(offset.y)}px) scale(${String(view.k)})`,
              transformOrigin: 'center',
            }}
          >
            <img
              alt={item.caption ?? ''}
              className={cn(
                'size-full select-none object-contain',
                dimmed && 'opacity-30',
              )}
              draggable={false}
              key={item.id}
              src={fitUrl}
            />
            {api.zoomed && zoomUrl !== null && zoomUrl !== fitUrl ? (
              <img
                alt=""
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 size-full select-none object-contain',
                  loadedUrl === zoomUrl ? 'opacity-100' : 'opacity-0',
                )}
                draggable={false}
                src={zoomUrl}
                onLoad={() => {
                  setLoadedUrl(zoomUrl)
                }}
              />
            ) : null}
          </div>
        ) : null}
        {badge}
      </div>
      {bare ? null : (
        <figcaption className="shrink-0 px-1 pt-1 text-xs text-white/80">
          {showActions || api.active ? (
            <span className="mr-2 rounded bg-white/20 px-1.5 py-0.5 font-semibold">
              {label}
            </span>
          ) : null}
          {item.starred ? (
            <Star
              aria-label={t('quickSort.starredBadge')}
              className="mr-1 inline fill-action-star text-action-star"
              role="img"
              size={14}
            />
          ) : null}
          <span data-testid="compare-caption">{details.join(' · ')}</span>
          {footer}
          {footer === null && showActions && actions !== undefined ? (
            <span className="mt-1 flex gap-2">
              <button
                aria-label={t('photoCompare.trash', { which })}
                className={ICON_TRASH}
                disabled={disabled}
                type="button"
                onClick={() => {
                  actions.trash(item)
                }}
              >
                <Trash2 aria-hidden="true" size={18} />
              </button>
              <button
                aria-label={t('photoCompare.keep', { which })}
                aria-pressed={actions.kept?.(item) ?? false}
                className={actions.kept?.(item) === true ? ICON_KEEP : ICON_BTN}
                disabled={keepOff}
                type="button"
                onClick={() => {
                  actions.keep(item)
                }}
              >
                <Check aria-hidden="true" size={18} />
              </button>
              <button
                aria-label={t(
                  item.starred ? 'photoCompare.unstar' : 'photoCompare.star',
                  { which },
                )}
                aria-pressed={item.starred}
                className={ICON_STAR}
                disabled={disabled}
                type="button"
                onClick={() => {
                  actions.star(item)
                }}
              >
                <Star
                  aria-hidden="true"
                  className={item.starred ? 'fill-action-star-foreground' : ''}
                  size={18}
                />
              </button>
            </span>
          ) : null}
        </figcaption>
      )}
    </figure>
  )
}
