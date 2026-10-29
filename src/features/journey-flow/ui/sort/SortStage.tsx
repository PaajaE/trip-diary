import { Check, Layers } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionPhoto } from '@/features/journey-flow/model/sort-session'
import {
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'
import {
  pickViewerImageVariant,
  pickZoomImageVariant,
} from '@/features/journey-workspace/lib/media-thumb'
import { fitSize } from '@/features/media-batch/model/zoom'
import { PhotoCompare } from '@/features/media-batch/ui/PhotoCompare'
import { usePaneSize } from '@/features/media-batch/ui/use-pane-size'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'
import {
  useSwipe,
  type SwipeDirection,
} from '@/features/media-batch/ui/use-swipe'
import { cn } from '@/shared/lib/cn'

export interface SortStageProps {
  baseUrl: string
  compare: PhotoCompareApi
  /** Full screen without distractions: no series chip, a tap toggles chrome. */
  fullscreen: boolean
  /** "3 z 9" within the stop. */
  index: number
  onSeries: () => void
  onSwipe: (direction: SwipeDirection) => void
  onTap?: () => void
  photo: SessionPhoto
  /** Size of the photo's series ("Podobné: 7"), 0 without one. */
  seriesCount: number
  /** Number of the stop just finished ("Zastávka 4 hotová"). */
  stopDone: number | null
  total: number
}

/**
 * The one big photo of the sorting screen with its badges: "Podobné: N",
 * the finished stop, the time and position, and a suggested-trash reason
 * (the photo is faded, never deleted). Swipe up = Koš.
 */
export function SortStage({
  baseUrl,
  compare,
  fullscreen,
  index,
  onSeries,
  onSwipe,
  onTap,
  photo,
  seriesCount,
  stopDone,
  total,
}: SortStageProps) {
  const { i18n, t } = useTranslation()
  const swipe = useSwipe({
    enabled: () => !compare.zoomed,
    onSwipe,
    ...(onTap === undefined ? {} : { onTap }),
  })
  const { item } = photo
  const zone = mediaDisplayZone(item, null)
  const time =
    item.capturedAt === null
      ? t('quickSort.noDate')
      : formatLocalTime(item.capturedAt, zone, i18n.language)
  const hint =
    photo.trashHint === null || photo.state !== 'open'
      ? null
      : t(`flow.sort.trashHint.${photo.trashHint}`)
  const badge =
    'rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white'
  // The badges sit on the photo itself, not in the empty sides of the stage.
  const stageRef = useRef<HTMLDivElement>(null)
  const stage = usePaneSize(stageRef)
  const variant = pickZoomImageVariant(item) ?? pickViewerImageVariant(item)
  const w = variant?.width ?? item.width ?? 0
  const h = variant?.height ?? item.height ?? 0
  const fit = fitSize(stage, h > 0 ? w / h : 0)
  const box =
    compare.zoomed || fit.w <= 0
      ? { height: '100%', left: 0, top: 0, width: '100%' }
      : {
          height: fit.h,
          left: (stage.w - fit.w) / 2,
          top: (stage.h - fit.h) / 2,
          width: fit.w,
        }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      data-testid="sort-stage"
      ref={stageRef}
      {...swipe}
    >
      <PhotoCompare
        api={compare}
        bare
        baseUrl={baseUrl}
        dimmed={photo.state === 'trash'}
        main={item}
        testId="sort-photo"
        toolbar={false}
      >
        <div
          className="pointer-events-none absolute"
          data-testid="sort-photo-box"
          style={box}
        >
          {hint === null ? null : (
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-black/40"
              data-testid="sort-trash-fade"
            />
          )}
          {fullscreen || seriesCount < 2 ? null : (
            <button
              className="pointer-events-auto absolute left-3 top-3 flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black shadow-soft"
              type="button"
              onClick={onSeries}
            >
              <Layers aria-hidden="true" size={16} />
              {t('flow.sort.similar', { count: seriesCount })}
            </button>
          )}
          {stopDone === null ? null : (
            <span
              className={cn(
                badge,
                'absolute right-3 top-5 flex items-center gap-1',
              )}
              data-testid="sort-stop-done"
            >
              <Check
                aria-hidden="true"
                className="text-action-keep"
                size={14}
              />
              {t('flow.sort.stopDone', { number: stopDone })}
            </span>
          )}
          {hint === null ? null : (
            <span
              className={cn(badge, 'absolute right-3 bottom-12 max-w-[70%]')}
              data-testid="sort-trash-hint"
            >
              {t('flow.sort.suggestedTrash', { reason: hint })}
            </span>
          )}
          <span
            className={cn(
              badge,
              // Full screen: on top, clear of the bottom controls.
              'absolute left-3 rounded-lg',
              fullscreen
                ? 'top-[max(0.75rem,env(safe-area-inset-top))]'
                : 'bottom-3',
            )}
            data-testid="sort-position"
          >
            {t('flow.sort.position', { index: index + 1, time, total })}
          </span>
        </div>
      </PhotoCompare>
    </div>
  )
}
