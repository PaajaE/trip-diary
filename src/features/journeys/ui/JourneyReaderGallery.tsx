import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'
import {
  buildPublicJourneyGallery,
  getPublicGalleryImageAlt,
  getPublicGalleryImageIndex,
  publicGalleryImagesToLightboxItems,
  type PublicGalleryImage,
} from '@/features/journeys/lib/public-journey-gallery'
import { useJourneyMomentPhotos } from '@/features/journeys/lib/use-journey-moment-photos'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { cn } from '@/shared/lib/cn'

interface JourneyReaderGalleryProps {
  layout?: 'full' | 'preview'
  onOpenMoment?: (entryId: string) => void
  previewLimit?: number
  stageContents: JourneyStageContent[]
}

export function JourneyReaderGallery({
  layout = 'full',
  onOpenMoment,
  previewLimit = 10,
  stageContents,
}: JourneyReaderGalleryProps) {
  const { i18n, t } = useTranslation()
  const moments = useMemo(
    () => stageContents.flatMap((content) => content.moments),
    [stageContents],
  )
  const { isPending, photosByEntryId } = useJourneyMomentPhotos(
    moments,
    moments.length > 0,
    'card',
  )
  const gallery = useMemo(
    () =>
      buildPublicJourneyGallery({
        locale: i18n.language,
        photosByEntryId,
        stageContents,
        t,
      }),
    [i18n.language, photosByEntryId, stageContents, t],
  )
  const previewPhotos = useMemo(
    () => gallery.flatImages.map((image) => image.preview),
    [gallery.flatImages],
  )
  const urls = usePhotoObjectUrls(previewPhotos)
  const urlByPhotoId = useMemo(
    () => new Map(urls.map((photo) => [photo.id, photo.url])),
    [urls],
  )
  const { lightboxElement, openLightbox } = usePhotoLightbox({
    ...(onOpenMoment !== undefined ? { onOpenMoment } : {}),
  })

  if (gallery.flatImages.length === 0) {
    if (isPending) {
      return (
        <p className="mt-8 text-sm text-muted" role="status">
          {t('journey.galleryLoading')}
        </p>
      )
    }
    return null
  }

  const previewImages =
    layout === 'preview'
      ? gallery.flatImages.slice(0, previewLimit)
      : gallery.flatImages
  const overflowCount = Math.max(
    0,
    gallery.flatImages.length - previewImages.length,
  )

  const lightboxPhotos = publicGalleryImagesToLightboxItems(
    gallery.flatImages,
    (image) => urlByPhotoId.get(image.id),
    t,
  )

  if (layout === 'preview') {
    return (
      <>
        <div className="editorial-photo-strip mt-8">
          {previewImages.map((image, index) => {
            const url = urlByPhotoId.get(image.id)
            if (url === undefined) {
              return null
            }
            const alt = getPublicGalleryImageAlt(image, t)
            const isLast =
              index === previewImages.length - 1 && overflowCount > 0
            return (
              <button
                aria-label={alt}
                className="editorial-photo-strip__item group relative"
                key={image.id}
                onClick={(event) => {
                  const photoIndex = getPublicGalleryImageIndex(
                    gallery,
                    image.id,
                  )
                  if (photoIndex < 0) {
                    return
                  }
                  openLightbox(lightboxPhotos, photoIndex, event.currentTarget)
                }}
                type="button"
              >
                <img
                  alt=""
                  aria-hidden="true"
                  className="size-full object-cover"
                  decoding="async"
                  loading="lazy"
                  src={url}
                />
                {isLast ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                    +{overflowCount}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        {gallery.flatImages.length > 0 ? (
          <div className="mt-5 flex justify-center">
            <button
              className="min-h-11 text-sm font-semibold text-primary hover:underline"
              onClick={(event) => {
                openLightbox(lightboxPhotos, 0, event.currentTarget)
              }}
              type="button"
            >
              {t('reader.galleryPreviewAction')}
            </button>
          </div>
        ) : null}
        {lightboxElement}
      </>
    )
  }

  return (
    <>
      <div className="mt-8 space-y-10 sm:space-y-12">
        {gallery.groups.map((group) => {
          const groupImages = group.imageIds.flatMap((photoId) => {
            const image = gallery.flatImages.find(
              (candidate) => candidate.id === photoId,
            )
            return image === undefined ? [] : [image]
          })

          if (groupImages.length === 0) {
            return null
          }

          return (
            <div key={group.key}>
              {group.label === null ? null : (
                <h3 className="reader-gallery-group-label mb-4 text-lg font-semibold text-foreground sm:text-xl">
                  {group.label}
                </h3>
              )}
              <ReaderGalleryGrid
                images={groupImages}
                onOpen={(photoId, trigger) => {
                  const index = getPublicGalleryImageIndex(gallery, photoId)
                  if (index < 0) {
                    return
                  }
                  openLightbox(lightboxPhotos, index, trigger)
                }}
                resolveUrl={(image) => urlByPhotoId.get(image.id)}
                t={t}
              />
            </div>
          )
        })}
      </div>
      {lightboxElement}
    </>
  )
}

function ReaderGalleryGrid({
  images,
  onOpen,
  resolveUrl,
  t,
}: {
  images: PublicGalleryImage[]
  onOpen: (photoId: string, trigger: HTMLElement) => void
  resolveUrl: (image: PublicGalleryImage) => string | undefined
  t: ReturnType<typeof useTranslation>['t']
}) {
  return (
    <div
      className={cn(
        'reader-gallery-grid',
        images.length === 1 ? 'reader-gallery-grid--single' : '',
      )}
    >
      {images.map((image) => (
        <ReaderGalleryItem
          image={image}
          key={image.id}
          onOpen={onOpen}
          resolveUrl={resolveUrl}
          t={t}
        />
      ))}
    </div>
  )
}

function ReaderGalleryItem({
  image,
  onOpen,
  resolveUrl,
  t,
}: {
  image: PublicGalleryImage
  onOpen: (photoId: string, trigger: HTMLElement) => void
  resolveUrl: (image: PublicGalleryImage) => string | undefined
  t: ReturnType<typeof useTranslation>['t']
}) {
  const url = resolveUrl(image)
  const alt = getPublicGalleryImageAlt(image, t)

  if (url === undefined) {
    return null
  }

  return (
    <button
      aria-label={alt}
      className="reader-gallery-item group relative overflow-hidden rounded-2xl shadow-soft"
      onClick={(event) => {
        onOpen(image.id, event.currentTarget)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(image.id, event.currentTarget)
        }
      }}
      type="button"
    >
      <img
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] group-focus-visible:scale-[1.02]"
        decoding="async"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.visibility = 'hidden'
        }}
        src={url}
      />
    </button>
  )
}
