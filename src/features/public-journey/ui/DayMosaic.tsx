import type { PublicMedia } from '@trip-diary/core/public-journey'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'
import { MosaicGrid } from '@/shared/ui/MosaicGrid'
import { ImageIcon } from 'lucide-react'

interface DayMosaicProps {
  className?: string
  /** Opens the lightbox at the photo (index into `media`). */
  onOpen?: (index: number) => void
  /** Photos in display order; at most three are shown. */
  media: readonly PublicMedia[]
  sizes: string
  /** All photos of the day (shown as "+N" beyond the three tiles). */
  total?: number
}

/** The 2/1/1 mosaic of a day or a stage card, shared layout with the editor. */
export function DayMosaic({
  className,
  media,
  onOpen,
  sizes,
  total = media.length,
}: DayMosaicProps) {
  const { t } = useTranslation()
  const shown = media.slice(0, 3)
  return (
    <MosaicGrid
      cells={shown.map((item, index) => {
        const view = (
          <PublicMediaView
            className="block h-full w-full object-cover"
            media={item}
            sizes={index === 0 ? sizes : '33vw'}
          />
        )
        return (
          <Fragment key={item.id}>
            {onOpen === undefined ? (
              view
            ) : (
              <button
                aria-label={t('publicJourney.openMedia')}
                className="block h-full w-full cursor-zoom-in"
                type="button"
                onClick={() => {
                  onOpen(index)
                }}
              >
                {view}
              </button>
            )}
          </Fragment>
        )
      })}
      className={className}
      empty={<ImageIcon aria-hidden="true" size={28} />}
      more={Math.max(0, total - shown.length)}
      testId="public-day-mosaic"
    />
  )
}
