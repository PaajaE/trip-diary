import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  ComparePane,
  ICON_BTN,
  type PhotoCompareActions,
} from '@/features/media-batch/ui/ComparePane'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'
import { cn } from '@/shared/lib/cn'

export type { PhotoCompareActions }

export interface PhotoCompareProps {
  actions?: PhotoCompareActions
  api: PhotoCompareApi
  baseUrl: string
  /** No caption under the photo (the screen shows its own facts). */
  bare?: boolean
  /** Dims the A photo (already sorted). */
  dimmed?: boolean
  main: MediaItem
  /** Sharpness relative to the series (0..1), as in the series view. */
  sharpness?: ReadonlyMap<string, number | null>
  stopTitle?: (item: MediaItem) => string | null
  testId: string
  /** The Compare / partner / Zoom row above the photos (default on). */
  toolbar?: boolean
  /** Overlays drawn over the photos (badges). */
  children?: ReactNode
}

const CHIP =
  'flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-40'

/**
 * One or two photos with a shared zoom: the shared stage of quick sort and the
 * series view. Side by side in landscape, stacked in portrait, with fixed
 * `minmax(0, 1fr)` tracks so a photo never overflows its cell.
 */
export function PhotoCompare({
  actions,
  api,
  baseUrl,
  bare = false,
  children,
  dimmed = false,
  main,
  sharpness,
  stopTitle,
  testId,
  toolbar = true,
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
      {toolbar ? (
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
      ) : null}
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
            <ComparePane
              actions={actions}
              api={api}
              bare={bare}
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
