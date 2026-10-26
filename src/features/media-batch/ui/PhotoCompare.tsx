import { Check, ChevronLeft, ChevronRight, Star, Trash2 } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
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
  cycleZoom,
  fitScaleOf,
  fitSize,
  panBy,
  translateOf,
  viewForPane,
  zoomAt,
  type Point,
  type Size,
} from '@/features/media-batch/model/zoom'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'
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

export interface PhotoCompareProps {
  actions?: PhotoCompareActions
  api: PhotoCompareApi
  baseUrl: string
  /** Dims the A photo (already sorted). */
  dimmed?: boolean
  main: MediaItem
  /** Sharpness relative to the series (0..1), as in the series view. */
  sharpness?: ReadonlyMap<string, number | null>
  stopTitle?: (item: MediaItem) => string | null
  testId: string
  /** Overlays drawn over the photos (badges). */
  children?: ReactNode
}

const CHIP =
  'flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-40'
const ICON_BTN =
  'flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40'
const TAP_MS = 300
const TAP_SLOP_PX = 24
const WHEEL_SENSITIVITY = 0.003

function usePaneSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ h: 0, w: 0 })
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const read = () => {
      const rect = node.getBoundingClientRect()
      setSize((prev) =>
        prev.w === rect.width && prev.h === rect.height
          ? prev
          : { h: rect.height, w: rect.width },
      )
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [ref])
  return size
}

interface PaneProps {
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
}

function Pane({
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
}: PaneProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const viewport = useRef<HTMLDivElement>(null)
  const size = usePaneSize(viewport)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const pointers = useRef(new Map<number, Point>())
  const pinch = useRef<number | null>(null)
  const tap = useRef<{ at: number; moved: boolean; x: number; y: number }>({
    at: 0,
    moved: false,
    x: 0,
    y: 0,
  })
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null)
  const pointerKind = useRef('mouse')
  const touchDoubleAt = useRef(0)

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
  const fit = fitSize(size, aspect)
  const fitScale = fitScaleOf(fit, pixelWidth)
  const view = viewForPane(api.zoom, fit, size)
  const offset = translateOf(view, fit)
  const scale = view.k * fitScale

  const { reportMetrics } = api
  useEffect(() => {
    if (isMain) reportMetrics({ fit, fitScale, pane: size })
  }, [isMain, reportMetrics, fit, fitScale, size])

  const offsetOf = (clientX: number, clientY: number): Point => {
    const rect = viewport.current?.getBoundingClientRect()
    return rect === undefined
      ? { x: 0, y: 0 }
      : {
          x: clientX - (rect.left + rect.width / 2),
          y: clientY - (rect.top + rect.height / 2),
        }
  }
  const cycleAt = (at: Point) => {
    api.setZoom((current) => cycleZoom(current, at, fit, size, fitScale))
  }

  // Ctrl + wheel (also a trackpad pinch). Native listener: it must not be passive.
  const onWheel = useRef<(event: WheelEvent) => void>(() => undefined)
  useEffect(() => {
    onWheel.current = (event) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const at = offsetOf(event.clientX, event.clientY)
      const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY)
      api.setZoom((current) =>
        zoomAt(current, current.k * factor, at, fit, size, fitScale),
      )
    }
  })
  useEffect(() => {
    const node = viewport.current
    if (node === null || videoUrl !== null) return
    const listener = (event: WheelEvent) => {
      onWheel.current(event)
    }
    node.addEventListener('wheel', listener, { passive: false })
    return () => {
      node.removeEventListener('wheel', listener)
    }
  }, [videoUrl])

  const distance = () => {
    const [p, q] = [...pointers.current.values()]
    return p === undefined || q === undefined
      ? 0
      : Math.hypot(p.x - q.x, p.y - q.y)
  }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerKind.current = event.pointerType
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Not capturable (synthetic event): dragging still works inside the pane.
    }
    if (pointers.current.size === 2) {
      pinch.current = distance()
      tap.current.moved = true
    } else {
      tap.current = {
        at: event.timeStamp,
        moved: false,
        x: event.clientX,
        y: event.clientY,
      }
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (previous === undefined) return
    const next = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, next)
    if (pointers.current.size === 2) {
      const now = distance()
      const before = pinch.current
      pinch.current = now
      if (before === null || before <= 0 || now <= 0) return
      const [p, q] = [...pointers.current.values()]
      if (p === undefined || q === undefined) return
      const at = offsetOf((p.x + q.x) / 2, (p.y + q.y) / 2)
      const ratio = now / before
      api.setZoom((current) =>
        zoomAt(current, current.k * ratio, at, fit, size, fitScale),
      )
      return
    }
    if (
      Math.hypot(next.x - tap.current.x, next.y - tap.current.y) > TAP_SLOP_PX
    )
      tap.current.moved = true
    if (api.zoomed) {
      api.setZoom((current) =>
        panBy(current, next.x - previous.x, next.y - previous.y, fit, size),
      )
    }
  }
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const had = pointers.current.delete(event.pointerId)
    pinch.current = null
    if (
      !had ||
      event.type === 'pointercancel' ||
      event.pointerType !== 'touch' ||
      tap.current.moved ||
      event.timeStamp - tap.current.at > TAP_MS
    )
      return
    // Double tap (a native dblclick is unreliable on touch).
    const previous = lastTap.current
    if (
      previous !== null &&
      event.timeStamp - previous.at < TAP_MS * 1.5 &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <
        TAP_SLOP_PX * 2
    ) {
      lastTap.current = null
      touchDoubleAt.current = event.timeStamp
      cycleAt(offsetOf(event.clientX, event.clientY))
    } else {
      lastTap.current = {
        at: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
      }
    }
  }

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
    >
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          videoUrl === null && 'touch-none',
          api.zoomed && 'cursor-grab active:cursor-grabbing',
        )}
        ref={viewport}
        onDoubleClick={(event) => {
          if (
            videoUrl !== null ||
            pointerKind.current !== 'mouse' ||
            event.timeStamp - touchDoubleAt.current < 600
          )
            return
          cycleAt(offsetOf(event.clientX, event.clientY))
        }}
        onPointerCancel={onPointerEnd}
        onPointerDown={videoUrl === null ? onPointerDown : undefined}
        onPointerMove={videoUrl === null ? onPointerMove : undefined}
        onPointerUp={onPointerEnd}
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
      </div>
      <figcaption className="shrink-0 px-1 pt-1 text-xs text-white/80">
        {showActions || api.active ? (
          <span className="mr-2 rounded bg-white/20 px-1.5 py-0.5 font-semibold">
            {label}
          </span>
        ) : null}
        {item.starred ? (
          <Star
            aria-label={t('quickSort.starredBadge')}
            className="mr-1 inline fill-amber-400 text-amber-400"
            role="img"
            size={14}
          />
        ) : null}
        <span data-testid="compare-caption">{details.join(' · ')}</span>
        {showActions && actions !== undefined ? (
          <span className="mt-1 flex gap-2">
            <button
              aria-label={t('photoCompare.trash', { which })}
              className={cn(ICON_BTN, 'bg-red-600 hover:bg-red-500')}
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
              className={cn(
                ICON_BTN,
                actions.kept?.(item) === true && 'bg-emerald-600',
              )}
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
              className={cn(ICON_BTN, 'bg-amber-400 text-black')}
              disabled={disabled}
              type="button"
              onClick={() => {
                actions.star(item)
              }}
            >
              <Star
                aria-hidden="true"
                className={item.starred ? 'fill-black' : ''}
                size={18}
              />
            </button>
          </span>
        ) : null}
      </figcaption>
    </figure>
  )
}

/**
 * One or two photos with a shared zoom: the shared stage of quick sort and the
 * series view. Side by side in landscape, stacked in portrait, with fixed
 * `minmax(0, 1fr)` tracks so a photo never overflows its cell.
 */
export function PhotoCompare({
  actions,
  api,
  baseUrl,
  children,
  dimmed = false,
  main,
  sharpness,
  stopTitle,
  testId,
}: PhotoCompareProps) {
  const { t } = useTranslation()
  const partner = api.active ? api.partner : undefined
  const panes = [
    { item: main, label: 'A' as const },
    ...(partner === undefined ? [] : [{ item: partner, label: 'B' as const }]),
  ]
  if (api.swapped) panes.reverse()

  return (
    <div
      className="flex min-h-0 flex-1 flex-col outline-none"
      data-compare-stage=""
      data-testid={testId}
      tabIndex={-1}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2">
        <button
          aria-pressed={api.on}
          className={cn(CHIP, api.on && 'bg-white/30')}
          disabled={!api.on && !api.canCompare}
          type="button"
          onClick={api.toggle}
        >
          {t('photoCompare.compare')}
        </button>
        {api.active ? (
          <>
            <button
              aria-label={t('photoCompare.previousPartner')}
              className={ICON_BTN}
              type="button"
              onClick={() => {
                api.step(-1)
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              aria-label={t('photoCompare.nextPartner')}
              className={ICON_BTN}
              type="button"
              onClick={() => {
                api.step(1)
              }}
            >
              <ChevronRight aria-hidden="true" />
            </button>
            <button className={CHIP} type="button" onClick={api.swap}>
              {t('photoCompare.swap')}
            </button>
          </>
        ) : null}
        <button
          aria-pressed={api.zoomed}
          className={cn(CHIP, api.zoomed && 'bg-white/30')}
          type="button"
          onClick={api.cycle}
        >
          {t('photoCompare.zoom')}
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            'grid size-full grid-cols-[minmax(0,1fr)] gap-2',
            partner === undefined
              ? 'grid-rows-[minmax(0,1fr)]'
              : 'grid-rows-[repeat(2,minmax(0,1fr))] landscape:grid-cols-[repeat(2,minmax(0,1fr))] landscape:grid-rows-[minmax(0,1fr)]',
          )}
        >
          {panes.map(({ item, label }) => (
            <Pane
              actions={actions}
              api={api}
              baseUrl={baseUrl}
              dimmed={label === 'A' && dimmed}
              isMain={label === 'A'}
              item={item}
              key={item.id}
              label={label}
              sharpness={sharpness}
              showActions={partner !== undefined}
              stopTitle={stopTitle?.(item) ?? null}
            />
          ))}
        </div>
        {children}
      </div>
    </div>
  )
}
