import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { EntryPhotoViewData } from '@/entities/photo/api/photo-gallery.repository'
import { MOMENT_PHOTO_PREVIEW_LIMIT } from '@/entities/photo/api/moment-photo-detail.repository'
import {
  coverObjectPositionStyle,
  focalFromPreview,
} from '@/entities/photo/lib/cover-focal-point'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { MomentCoverHero } from '@/features/journeys/ui/MomentCoverHero'
import { MomentPhotoMosaic } from '@/features/journeys/ui/MomentPhotoMosaic'
import {
  MOMENT_MOSAIC_SIZES,
  momentMediaColumnClass,
} from '@/features/journeys/ui/moment-editorial-layout'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { cn } from '@/shared/lib/cn'

interface MomentMediaViewProps {
  alt: string
  className?: string
  coverClassName?: string
  entryId: string
  mosaicClassName?: string
  showCover?: boolean
  showMosaic?: boolean
  showMosaicHeading?: boolean
  viewData: EntryPhotoViewData
}

export function MomentMediaView({
  alt,
  className,
  coverClassName,
  entryId,
  mosaicClassName,
  showCover = true,
  showMosaic = true,
  showMosaicHeading = false,
  viewData,
}: MomentMediaViewProps) {
  const { t } = useTranslation()
  const displayUrls = usePhotoObjectUrls(viewData.displayPhotos)

  const coverIndex = viewData.displayPhotos.findIndex(
    (photo) => photo.isCover === true,
  )
  const resolvedCoverIndex = coverIndex >= 0 ? coverIndex : 0
  const cover = displayUrls[resolvedCoverIndex]
  const coverMeta = viewData.displayPhotos[resolvedCoverIndex]
  const coverPhotoId = coverMeta?.id ?? null

  const previewPhotos = useMemo(
    () => displayUrls.filter((preview) => preview.id !== coverPhotoId),
    [coverPhotoId, displayUrls],
  )

  const previewMeta = useMemo(
    () =>
      viewData.displayPhotos
        .filter((photo) => photo.id !== coverPhotoId)
        .slice(0, MOMENT_PHOTO_PREVIEW_LIMIT),
    [coverPhotoId, viewData.displayPhotos],
  )

  const mosaicTiles = useMemo(
    () =>
      previewPhotos.slice(0, MOMENT_PHOTO_PREVIEW_LIMIT).map((preview) => {
        const meta = previewMeta.find((photo) => photo.id === preview.id)
        return {
          id: preview.id,
          src: preview.url,
          ...(meta?.mediaType === undefined
            ? {}
            : { mediaType: meta.mediaType }),
        }
      }),
    [previewMeta, previewPhotos],
  )

  const { lightboxElement, openLightbox } = usePhotoLightbox({})
  const lightboxPhotos = useMemo(
    () =>
      viewData.allPhotos.map((photo) => {
        const displayUrl = displayUrls.find((item) => item.id === photo.id)
        return {
          alt,
          entryId,
          id: photo.id,
          ...(photo.mediaType === 'video'
            ? { mediaType: 'video' as const }
            : {}),
          thumbUrl: displayUrl?.url ?? '',
        }
      }),
    [alt, displayUrls, entryId, viewData.allPhotos],
  )

  function openAtPhotoId(photoId: string) {
    const index = viewData.allPhotos.findIndex((photo) => photo.id === photoId)
    openLightbox(lightboxPhotos, index >= 0 ? index : 0)
  }

  if (displayUrls.length === 0) {
    return null
  }

  const focalStyle =
    coverMeta !== undefined
      ? coverObjectPositionStyle(focalFromPreview(coverMeta), 'center 32%')
      : undefined

  const allPhotosForCount = viewData.allPhotos.map((photo) => ({
    id: photo.id,
    isCover: photo.isCover === true,
  }))

  return (
    <div
      aria-label={t('entry.mediaSectionTitle', { count: viewData.totalCount })}
      className={cn(momentMediaColumnClass, className)}
      role="group"
    >
      {showCover && cover !== undefined ? (
        <MomentCoverHero
          alt={alt}
          onClick={() => {
            openAtPhotoId(cover.id)
          }}
          showCoverBadge={false}
          src={cover.url}
          useResponsiveImage
          {...(coverClassName === undefined
            ? {}
            : { className: coverClassName })}
          {...(focalStyle === undefined ? {} : { focalStyle })}
          {...(coverMeta?.mediaType === undefined
            ? {}
            : { mediaType: coverMeta.mediaType })}
        />
      ) : null}

      {showMosaic && mosaicTiles.length > 0 ? (
        <MomentPhotoMosaic
          allPhotos={allPhotosForCount}
          onOpenPhoto={openAtPhotoId}
          photos={mosaicTiles}
          {...(showCover ? { className: 'mt-10' } : {})}
          {...(showMosaicHeading
            ? {
                heading: (
                  <h2 className="reader-display mb-0 text-2xl tracking-[-0.03em]">
                    {t('reader.photosHeading')}
                  </h2>
                ),
              }
            : {})}
          {...(mosaicClassName === undefined ? {} : { mosaicClassName })}
          renderTileImage={(photo, imageClassName) => (
            <>
              <ResponsivePhotoImage
                alt=""
                className={imageClassName}
                decorative
                sizes={MOMENT_MOSAIC_SIZES}
                src={photo.src}
              />
              {photo.mediaType === 'video' ? <VideoPlayOverlay /> : null}
            </>
          )}
        />
      ) : null}

      {lightboxElement}
    </div>
  )
}

export function MomentMediaCover({
  alt,
  entryId,
  viewData,
}: {
  alt: string
  entryId: string
  viewData: EntryPhotoViewData
}) {
  return (
    <MomentMediaView
      alt={alt}
      entryId={entryId}
      showMosaic={false}
      viewData={viewData}
    />
  )
}

export function MomentMediaMosaic({
  alt,
  className,
  entryId,
  showHeading = true,
  viewData,
}: {
  alt: string
  className?: string
  entryId: string
  showHeading?: boolean
  viewData: EntryPhotoViewData
}) {
  return (
    <MomentMediaView
      alt={alt}
      entryId={entryId}
      showCover={false}
      showMosaicHeading={showHeading}
      viewData={viewData}
      {...(className === undefined ? {} : { className })}
    />
  )
}
