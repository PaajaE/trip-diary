import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  MomentPhotoMeta,
  MomentPhotoThumb,
} from '@/entities/photo/api/moment-photo-detail.repository'
import { MOMENT_PHOTO_PREVIEW_LIMIT } from '@/entities/photo/api/moment-photo-detail.repository'

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
    return <div aria-hidden="true" className={`${className} reader-photo-placeholder`} />
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

export function MomentPhotoPreview({
  onOpenGallery,
  photos,
  preview,
  totalCount,
}: MomentPhotoPreviewProps) {
  const { t } = useTranslation()
  const remaining = Math.max(0, totalCount - preview.length)
  const mosaic = useMemo(() => preview.slice(0, MOMENT_PHOTO_PREVIEW_LIMIT), [preview])

  if (mosaic.length === 0) {
    return null
  }

  const openAt = (photoId: string) => {
    onOpenGallery(photoId)
  }

  const lastIndex = mosaic.length - 1
  const showOverlayOnLast = remaining > 0

  return (
    <section aria-label={t('reader.photoPreviewSection')} className="mt-10">
      <div className="flex items-end justify-between gap-3">
        <h2 className="reader-display text-2xl tracking-[-0.03em]">
          {t('reader.photosHeading')}
        </h2>
        {totalCount > MOMENT_PHOTO_PREVIEW_LIMIT ? (
          <button
            className="min-h-11 text-sm font-semibold text-primary hover:underline"
            onClick={() => {
              const first = photos[0] ?? mosaic[0]
              if (first !== undefined) {
                openAt(first.id)
              }
            }}
            type="button"
          >
            {t('reader.viewAllPhotos', { count: totalCount })}
          </button>
        ) : null}
      </div>

      <div
        className={
          mosaic.length === 1
            ? 'mt-4'
            : mosaic.length === 2
              ? 'mt-4 grid grid-cols-2 gap-3'
              : mosaic.length === 3
                ? 'mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3'
                : 'mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3'
        }
      >
        {mosaic.map((photo, index) => {
          const isFeature =
            mosaic.length >= 3 && index === 0
              ? 'col-span-2 aspect-[16/10] rounded-[1.5rem] sm:col-span-2 sm:row-span-2 sm:aspect-auto sm:min-h-[18rem]'
              : mosaic.length === 1
                ? 'aspect-[16/10] w-full rounded-[1.5rem]'
                : 'aspect-[4/3] rounded-2xl'

          const showMoreOverlay = showOverlayOnLast && index === lastIndex

          return (
            <div className={`relative ${isFeature}`} key={photo.id}>
              <PreviewTile
                className="size-full rounded-[inherit]"
                onOpen={() => {
                  openAt(photo.id)
                }}
                photo={photo}
              />
              {showMoreOverlay ? (
                <button
                  className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/45 text-center text-base font-semibold text-white backdrop-blur-[1px] transition hover:bg-black/55"
                  onClick={() => {
                    openAt(photo.id)
                  }}
                  type="button"
                >
                  {t('reader.morePhotosCount', { count: remaining })}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
