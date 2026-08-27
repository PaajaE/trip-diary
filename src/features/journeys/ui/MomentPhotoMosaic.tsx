import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  MomentPhotoMeta,
  MomentPhotoThumb,
} from '@/entities/photo/api/moment-photo-detail.repository'
import { MOMENT_PHOTO_PREVIEW_LIMIT } from '@/entities/photo/api/moment-photo-detail.repository'
import {
  countHiddenMomentPreviewPhotos,
  momentPhotoMosaicClassName,
  resolveMomentPhotoMosaicCount,
} from '@/features/journeys/lib/moment-photo-preview-layout'
import { cn } from '@/shared/lib/cn'

export interface MomentMosaicTile {
  caption?: string | null
  id: string
  mediaType?: 'photo' | 'video'
  src: string
}

interface MomentPhotoMosaicProps {
  allPhotos: readonly { id: string; isCover: boolean }[]
  className?: string
  heading?: ReactNode
  mosaicClassName?: string
  onOpenPhoto: (photoId: string) => void
  photos: readonly MomentMosaicTile[]
  renderTileImage: (
    photo: MomentMosaicTile,
    imageClassName: string,
    onBroken?: () => void,
  ) => ReactNode
  renderTileOverlay?: (photo: MomentMosaicTile, index: number) => ReactNode
}

function morePhotosLabel(
  t: TFunction,
  language: string,
  count: number,
): string {
  const isCzech = language.startsWith('cs')
  if (!isCzech) {
    return t(
      count === 1 ? 'reader.morePhotosCountOne' : 'reader.morePhotosCountMany',
      { count },
    )
  }
  if (count === 1) {
    return t('reader.morePhotosCountOne', { count })
  }
  if (count >= 2 && count <= 4) {
    return t('reader.morePhotosCountFew', { count })
  }
  return t('reader.morePhotosCountMany', { count })
}

function MosaicTile({
  ariaLabel,
  imageClassName,
  onOpen,
  overlay,
  photo,
  renderTileImage,
}: {
  ariaLabel: string
  imageClassName: string
  onOpen: () => void
  overlay?: ReactNode
  photo: MomentMosaicTile
  renderTileImage: MomentPhotoMosaicProps['renderTileImage']
}) {
  const [broken, setBroken] = useState(false)

  if (broken) {
    return (
      <div
        aria-hidden="true"
        className={`${imageClassName} reader-photo-placeholder`}
      />
    )
  }

  return (
    <>
      <button
        aria-label={ariaLabel}
        className="group relative block size-full overflow-hidden rounded-[inherit] focus-visible:outline-offset-2"
        onClick={onOpen}
        type="button"
      >
        {renderTileImage(photo, imageClassName, () => {
          setBroken(true)
        })}
      </button>
      {overlay}
    </>
  )
}

export function MomentPhotoMosaic({
  allPhotos,
  className,
  heading,
  mosaicClassName,
  onOpenPhoto,
  photos,
  renderTileImage,
  renderTileOverlay,
}: MomentPhotoMosaicProps) {
  const { i18n, t } = useTranslation()

  const mosaic = useMemo(
    () => photos.slice(0, MOMENT_PHOTO_PREVIEW_LIMIT),
    [photos],
  )

  const hiddenCount = useMemo(() => {
    const photoMeta: MomentPhotoMeta[] = allPhotos.map((photo) => ({
      caption: null,
      capturedAt: null,
      focalX: null,
      focalY: null,
      id: photo.id,
      isCover: photo.isCover,
      latitude: null,
      longitude: null,
      position: 0,
    }))
    const previewThumbs: MomentPhotoThumb[] = mosaic.map((photo) => ({
      caption: photo.caption ?? null,
      capturedAt: null,
      focalX: null,
      focalY: null,
      id: photo.id,
      isCover: false,
      latitude: null,
      longitude: null,
      position: 0,
      thumbUrl: photo.src,
    }))
    return countHiddenMomentPreviewPhotos(photoMeta, previewThumbs)
  }, [allPhotos, mosaic])

  if (mosaic.length === 0) {
    return null
  }

  const mosaicCount = resolveMomentPhotoMosaicCount(mosaic.length)
  const lastIndex = mosaic.length - 1
  const showOverlayOnLast = hiddenCount > 0
  const imageClassName =
    'size-full object-cover transition duration-500 group-hover:scale-[1.03]'

  return (
    <section className={className}>
      {heading}
      <div
        className={cn(momentPhotoMosaicClassName(mosaicCount), mosaicClassName)}
      >
        {mosaic.map((photo, index) => {
          const showMoreOverlay = showOverlayOnLast && index === lastIndex

          return (
            <div className="moment-photo-mosaic__tile" key={photo.id}>
              <MosaicTile
                ariaLabel={photo.caption ?? String(index + 1)}
                imageClassName={imageClassName}
                onOpen={() => {
                  onOpenPhoto(photo.id)
                }}
                overlay={
                  showMoreOverlay ? (
                    <button
                      className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/45 text-center text-base font-semibold text-white backdrop-blur-[1px] transition hover:bg-black/55"
                      onClick={() => {
                        onOpenPhoto(photo.id)
                      }}
                      type="button"
                    >
                      {morePhotosLabel(t, i18n.language, hiddenCount)}
                    </button>
                  ) : (
                    renderTileOverlay?.(photo, index)
                  )
                }
                photo={photo}
                renderTileImage={renderTileImage}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
