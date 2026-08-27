import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import {
  coverObjectPositionStyle,
  focalFromPreview,
} from '@/entities/photo/lib/cover-focal-point'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { cn } from '@/shared/lib/cn'

interface MomentMediaViewProps {
  alt: string
  entryId: string
  photos: PhotoPreview[]
}

export function MomentMediaView({
  alt,
  entryId,
  photos,
}: MomentMediaViewProps) {
  const { t } = useTranslation()
  const urls = usePhotoObjectUrls(photos)

  const coverIndex = photos.findIndex((photo) => photo.isCover === true)
  const resolvedCoverIndex = coverIndex >= 0 ? coverIndex : 0
  const cover = urls[resolvedCoverIndex]
  const coverMeta = photos[resolvedCoverIndex]
  const rest = urls.filter((_, index) => index !== resolvedCoverIndex)

  const { lightboxElement, openLightbox } = usePhotoLightbox({})
  const lightboxPhotos = urls.map((preview) => ({
    alt,
    entryId,
    id: preview.id,
    ...(photos.find((photo) => photo.id === preview.id)?.mediaType === 'video'
      ? { mediaType: 'video' as const }
      : {}),
    thumbUrl: preview.url,
  }))

  if (urls.length === 0) {
    return null
  }

  const focalStyle =
    coverMeta !== undefined
      ? coverObjectPositionStyle(focalFromPreview(coverMeta), '50% 50%')
      : undefined

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
          {t('entry.mediaSectionTitle', { count: photos.length })}
        </h2>
      </div>

      <div
        className={cn(
          'grid gap-2',
          rest.length > 0
            ? 'grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'
            : 'grid-cols-1',
        )}
      >
        {cover !== undefined ? (
          <button
            aria-label={alt}
            className={cn(
              'relative overflow-hidden rounded-2xl focus-visible:outline-offset-2',
              rest.length > 0
                ? 'row-span-2 min-h-[14rem] sm:min-h-[18rem]'
                : '',
            )}
            onClick={() => {
              openLightbox(lightboxPhotos, resolvedCoverIndex)
            }}
            type="button"
          >
            <ResponsivePhotoImage
              alt={alt}
              className="size-full min-h-[14rem] object-cover sm:min-h-[18rem]"
              {...(typeof coverMeta?.height === 'number'
                ? { height: coverMeta.height }
                : {})}
              sizes={GALLERY_GRID_SIZES}
              src={cover.url}
              {...(focalStyle === undefined ? {} : { style: focalStyle })}
              {...(typeof coverMeta?.width === 'number'
                ? { width: coverMeta.width }
                : {})}
            />
            {coverMeta?.mediaType === 'video' ? <VideoPlayOverlay /> : null}
            <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
              <Star aria-hidden="true" className="size-3 fill-current" />
              {t('entry.coverPhoto')}
            </span>
          </button>
        ) : null}

        {rest.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
            {rest.map((preview, index) => {
              const meta = photos.find((photo) => photo.id === preview.id)
              const openIndex = urls.findIndex((item) => item.id === preview.id)
              return (
                <button
                  aria-label={`${alt} ${String(index + 2)}`}
                  className="relative overflow-hidden rounded-xl focus-visible:outline-offset-2"
                  key={preview.id}
                  onClick={() => {
                    openLightbox(lightboxPhotos, openIndex >= 0 ? openIndex : 0)
                  }}
                  type="button"
                >
                  <ResponsivePhotoImage
                    alt=""
                    className="aspect-square w-full object-cover"
                    decorative
                    {...(typeof meta?.height === 'number'
                      ? { height: meta.height }
                      : {})}
                    sizes={GALLERY_GRID_SIZES}
                    src={preview.url}
                    {...(typeof meta?.width === 'number'
                      ? { width: meta.width }
                      : {})}
                  />
                  {meta?.mediaType === 'video' ? <VideoPlayOverlay /> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {lightboxElement}
    </section>
  )
}
