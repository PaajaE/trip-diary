import type { TFunction } from 'i18next'
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

interface MomentPhotoPreviewProps {
  onOpenGallery: (photoId: string) => void
  photos: MomentPhotoMeta[]
  preview: MomentPhotoThumb[]
  totalCount: number
}

function PreviewTile({
  className,
  onOpen,
  photo,
}: {
  className: string
  onOpen: () => void
  photo: MomentPhotoThumb
}) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div
        aria-hidden="true"
        className={`${className} reader-photo-placeholder`}
      />
    )
  }

  return (
    <button
      aria-label={photo.caption ?? undefined}
      className={`${className} group relative block overflow-hidden`}
      onClick={onOpen}
      type="button"
    >
      <img
        alt=""
        className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
        decoding="async"
        loading="lazy"
        onError={() => {
          setBroken(true)
        }}
        src={photo.thumbUrl}
      />
    </button>
  )
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

export function MomentPhotoPreview({
  onOpenGallery,
  photos,
  preview,
  totalCount,
}: MomentPhotoPreviewProps) {
  const { i18n, t } = useTranslation()
  const mosaic = useMemo(
    () => preview.slice(0, MOMENT_PHOTO_PREVIEW_LIMIT),
    [preview],
  )
  const hiddenCount = useMemo(
    () => countHiddenMomentPreviewPhotos(photos, mosaic),
    [mosaic, photos],
  )

  if (mosaic.length === 0) {
    return null
  }

  const mosaicCount = resolveMomentPhotoMosaicCount(mosaic.length)
  const lastIndex = mosaic.length - 1
  const showOverlayOnLast = hiddenCount > 0

  return (
    <section aria-label={t('reader.photoPreviewSection')} className="mt-10">
      <div className="flex items-end justify-between gap-3">
        <h2 className="reader-display text-2xl tracking-[-0.03em]">
          {t('reader.photosHeading')}
        </h2>
        {hiddenCount > 0 || totalCount > mosaic.length + 1 ? (
          <button
            className="min-h-11 text-sm font-semibold text-primary hover:underline"
            onClick={() => {
              const first = photos[0] ?? mosaic[0]
              if (first !== undefined) {
                onOpenGallery(first.id)
              }
            }}
            type="button"
          >
            {t('reader.viewAllPhotos', { count: totalCount })}
          </button>
        ) : null}
      </div>

      <div className={momentPhotoMosaicClassName(mosaicCount)}>
        {mosaic.map((photo, index) => {
          const showMoreOverlay = showOverlayOnLast && index === lastIndex

          return (
            <div className="moment-photo-mosaic__tile" key={photo.id}>
              <PreviewTile
                className="size-full rounded-[inherit]"
                onOpen={() => {
                  onOpenGallery(photo.id)
                }}
                photo={photo}
              />
              {showMoreOverlay ? (
                <button
                  className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/45 text-center text-base font-semibold text-white backdrop-blur-[1px] transition hover:bg-black/55"
                  onClick={() => {
                    onOpenGallery(photo.id)
                  }}
                  type="button"
                >
                  {morePhotosLabel(t, i18n.language, hiddenCount)}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
