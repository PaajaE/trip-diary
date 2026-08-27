import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  MomentPhotoMeta,
  MomentPhotoThumb,
} from '@/entities/photo/api/moment-photo-detail.repository'
import { MomentPhotoMosaic } from '@/features/journeys/ui/MomentPhotoMosaic'

interface MomentPhotoPreviewProps {
  onOpenGallery: (photoId: string) => void
  photos: MomentPhotoMeta[]
  preview: MomentPhotoThumb[]
  totalCount: number
}

export function MomentPhotoPreview({
  onOpenGallery,
  photos,
  preview,
  totalCount,
}: MomentPhotoPreviewProps) {
  const { t } = useTranslation()

  const mosaicTiles = useMemo(
    () =>
      preview.map((photo) => ({
        caption: photo.caption,
        id: photo.id,
        src: photo.thumbUrl,
      })),
    [preview],
  )

  return (
    <>
      <div className="mb-0 flex items-end justify-between gap-3">
        <h2 className="reader-display text-2xl tracking-[-0.03em]">
          {t('reader.photosHeading')}
        </h2>
        {totalCount > mosaicTiles.length + 1 ? (
          <button
            className="min-h-11 text-sm font-semibold text-primary hover:underline"
            onClick={() => {
              const first = photos[0] ?? preview[0]
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
      <MomentPhotoMosaic
        allPhotos={photos}
        onOpenPhoto={onOpenGallery}
        photos={mosaicTiles}
        renderTileImage={(photo, imageClassName, onBroken) => (
          <img
            alt=""
            className={imageClassName}
            decoding="async"
            loading="lazy"
            onError={onBroken}
            src={photo.src}
          />
        )}
      />
    </>
  )
}
