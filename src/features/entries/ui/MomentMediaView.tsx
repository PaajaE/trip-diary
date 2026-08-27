import { Star } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { EntryPhotoViewData } from '@/entities/photo/api/photo-gallery.repository'
import { MOMENT_PHOTO_PREVIEW_LIMIT } from '@/entities/photo/api/moment-photo-detail.repository'
import {
  coverObjectPositionStyle,
  focalFromPreview,
} from '@/entities/photo/lib/cover-focal-point'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import {
  countHiddenMomentPreviewPhotos,
  momentPhotoMosaicClassName,
  resolveMomentPhotoMosaicCount,
} from '@/features/journeys/lib/moment-photo-preview-layout'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { cn } from '@/shared/lib/cn'

interface MomentMediaViewProps {
  alt: string
  entryId: string
  viewData: EntryPhotoViewData
}

function morePhotosLabel(
  t: ReturnType<typeof useTranslation>['t'],
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

export function MomentMediaView({
  alt,
  entryId,
  viewData,
}: MomentMediaViewProps) {
  const { i18n, t } = useTranslation()
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
      viewData.displayPhotos.filter((photo) => photo.id !== coverPhotoId).slice(
        0,
        MOMENT_PHOTO_PREVIEW_LIMIT,
      ),
    [coverPhotoId, viewData.displayPhotos],
  )

  const mosaic = previewPhotos.slice(0, MOMENT_PHOTO_PREVIEW_LIMIT)
  const hiddenCount = useMemo(
    () =>
      countHiddenMomentPreviewPhotos(
        viewData.allPhotos.map((photo) => ({
          caption: null,
          capturedAt: null,
          focalX: photo.focalX ?? null,
          focalY: photo.focalY ?? null,
          id: photo.id,
          isCover: photo.isCover === true,
          latitude: null,
          longitude: null,
          position: 0,
        })),
        mosaic.map((photo) => ({
          caption: null,
          capturedAt: null,
          focalX: null,
          focalY: null,
          id: photo.id,
          isCover: false,
          latitude: null,
          longitude: null,
          position: 0,
          thumbUrl: photo.url,
        })),
      ),
    [mosaic, viewData.allPhotos],
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
          ...(photo.mediaType === 'video' ? { mediaType: 'video' as const } : {}),
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

  const mosaicCount =
    mosaic.length > 0 ? resolveMomentPhotoMosaicCount(mosaic.length) : 0
  const lastMosaicIndex = mosaic.length - 1
  const showOverlayOnLast = hiddenCount > 0

  return (
    <section aria-label={t('entry.mediaSectionTitle', { count: viewData.totalCount })}>
      {cover !== undefined ? (
        <button
          aria-label={alt}
          className="group relative block w-full overflow-hidden rounded-2xl focus-visible:outline-offset-2 sm:rounded-[1.25rem]"
          onClick={() => {
            openAtPhotoId(cover.id)
          }}
          type="button"
        >
          <ResponsivePhotoImage
            alt={alt}
            className="aspect-[16/10] max-h-[min(58svh,34rem)] w-full object-cover transition duration-500 group-hover:scale-[1.01]"
            sizes="(max-width: 640px) 100vw, min(68rem, 90vw)"
            src={cover.url}
            {...(focalStyle === undefined ? {} : { style: focalStyle })}
          />
          {coverMeta?.mediaType === 'video' ? <VideoPlayOverlay /> : null}
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/95">
            <Star aria-hidden="true" className="size-3 fill-current" />
            {t('entry.coverPhoto')}
          </span>
        </button>
      ) : null}

      {mosaic.length > 0 ? (
        <div
          className={cn(
            momentPhotoMosaicClassName(mosaicCount as 1 | 2 | 3 | 4 | 5),
            'mt-3',
          )}
        >
          {mosaic.map((preview, index) => {
            const meta = previewMeta.find((photo) => photo.id === preview.id)
            const showMoreOverlay = showOverlayOnLast && index === lastMosaicIndex

            return (
              <div className="moment-photo-mosaic__tile" key={preview.id}>
                <button
                  aria-label={`${alt} ${String(index + 2)}`}
                  className="group relative block size-full overflow-hidden rounded-[inherit] focus-visible:outline-offset-2"
                  onClick={() => {
                    openAtPhotoId(preview.id)
                  }}
                  type="button"
                >
                  <ResponsivePhotoImage
                    alt=""
                    className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    decorative
                    sizes={GALLERY_GRID_SIZES}
                    src={preview.url}
                  />
                  {meta?.mediaType === 'video' ? <VideoPlayOverlay /> : null}
                </button>
                {showMoreOverlay ? (
                  <button
                    className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/45 text-center text-base font-semibold text-white backdrop-blur-[1px] transition hover:bg-black/55"
                    onClick={() => {
                      openAtPhotoId(preview.id)
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
      ) : null}

      {lightboxElement}
    </section>
  )
}
