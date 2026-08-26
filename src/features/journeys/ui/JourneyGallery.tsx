import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { getJourneyEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import { GALLERY_GRID_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import {
  journeyGalleryQueryKey,
  loadJourneyGalleryPreviews,
  mergeJourneyGalleryPhotos,
  type JourneyGalleryMoment,
  type JourneyGalleryPreviews,
} from '@/features/journeys/lib/journey-gallery'
import { filterGalleryPhotosByTag } from '@/features/journeys/lib/journey-tag-collections'
import { PhotoTagList } from '@/features/photos/ui/PhotoTagList'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'

interface JourneyGalleryProps {
  canDelete?: boolean
  creatorId?: string
  filterTagSlug?: string | null
  journeyId?: string
  locatedPhotoIds: ReadonlySet<string>
  moments: JourneyGalleryMoment[]
  onOpenMoment?: (entryId: string) => void
  onShowOnMap: (photoId: string) => void
  showPhotoEngagement?: boolean
  tagAssignments?: PhotoTagAssignment[]
  tagsByPhotoId?: Map<string, PhotoTagAssignment[]>
}

function JourneyGalleryImage({
  alt,
  height,
  onOpen,
  onShowOnMap,
  photoId,
  showOnMap,
  showOnMapLabel,
  src,
  tags,
  width,
}: {
  alt: string
  height?: number
  onOpen: () => void
  onShowOnMap: (photoId: string) => void
  photoId: string
  showOnMap: boolean
  showOnMapLabel: string
  src: string
  tags?: PhotoTagAssignment[]
  width?: number
}) {
  const [isBroken, setIsBroken] = useState(false)

  if (isBroken) {
    return null
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-surface shadow-soft">
      <button
        aria-label={alt}
        className="block w-full"
        onClick={onOpen}
        type="button"
      >
        <ResponsivePhotoImage
          alt={alt}
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          {...(typeof height === 'number' ? { height } : {})}
          onError={() => {
            setIsBroken(true)
          }}
          sizes={GALLERY_GRID_SIZES}
          src={src}
          {...(typeof width === 'number' ? { width } : {})}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-sm font-semibold text-white">
          {alt}
        </span>
        {tags !== undefined && tags.length > 0 ? (
          <div className="pointer-events-none absolute left-2 top-2 max-w-[calc(100%-3rem)]">
            <PhotoTagList tags={tags} />
          </div>
        ) : null}
      </button>
      {showOnMap ? (
        <button
          aria-label={showOnMapLabel}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition hover:bg-background"
          onClick={(event) => {
            event.stopPropagation()
            onShowOnMap(photoId)
          }}
          type="button"
        >
          <MapPin aria-hidden="true" size={14} />
          {showOnMapLabel}
        </button>
      ) : null}
    </div>
  )
}

export function JourneyGallery({
  canDelete = false,
  creatorId,
  filterTagSlug = null,
  journeyId,
  locatedPhotoIds,
  moments,
  onOpenMoment,
  onShowOnMap,
  showPhotoEngagement = false,
  tagAssignments = [],
  tagsByPhotoId,
}: JourneyGalleryProps) {
  const { t } = useTranslation()
  const previewsQuery = useQuery({
    queryFn: () =>
      loadJourneyGalleryPreviews(moments, getJourneyEntryPhotoPreviews),
    queryKey: journeyGalleryQueryKey(moments),
  })
  const previewData = isJourneyGalleryPreviews(previewsQuery.data)
    ? previewsQuery.data
    : null
  const photos = useMemo(() => {
    const merged = mergeJourneyGalleryPhotos(
      moments,
      previewData?.previewsByMoment ?? [],
    )
    return filterGalleryPhotosByTag(merged, tagAssignments, filterTagSlug)
  }, [filterTagSlug, moments, previewData?.previewsByMoment, tagAssignments])
  const urls = usePhotoObjectUrls(photos)
  const { lightboxElement, openLightbox } = usePhotoLightbox({
    canDelete,
    canEditTags: canDelete && journeyId !== undefined,
    canLogObservation: canDelete && journeyId !== undefined,
    ...(creatorId !== undefined ? { creatorId } : {}),
    ...(journeyId !== undefined ? { journeyId } : {}),
    ...(onOpenMoment !== undefined ? { onOpenMoment } : {}),
    photoEngagement: showPhotoEngagement,
    ...(tagsByPhotoId !== undefined ? { tagsByPhotoId } : {}),
  })

  const hasPartialError = (previewData?.failedMomentCount ?? 0) > 0

  if (previewsQuery.isPending && urls.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted" role="status">
        {t('journey.galleryLoading')}
      </p>
    )
  }

  if (previewsQuery.isError && urls.length === 0) {
    return (
      <p className="mt-8 text-sm text-destructive" role="alert">
        {t('journey.galleryError')}
      </p>
    )
  }

  if (urls.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted">{t('journey.galleryEmpty')}</p>
    )
  }

  const lightboxPhotos = urls.map((photo) => ({
    alt: photo.entryTitle ?? t('journey.galleryUntitled'),
    entryId: photo.entryId,
    id: photo.id,
    thumbUrl: photo.url,
  }))

  return (
    <>
      {hasPartialError ? (
        <p className="mt-8 text-sm text-muted" role="status">
          {t('journey.galleryPartialError')}
        </p>
      ) : null}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((photo, photoIndex) => {
          const meta = photos.find((candidate) => candidate.id === photo.id)
          return (
            <JourneyGalleryImage
              alt={photo.entryTitle ?? t('journey.galleryUntitled')}
              {...(typeof meta?.height === 'number'
                ? { height: meta.height }
                : {})}
              key={`${photo.entryId}:${photo.id}`}
              onOpen={() => {
                openLightbox(lightboxPhotos, photoIndex)
              }}
              onShowOnMap={onShowOnMap}
              photoId={photo.id}
              showOnMap={locatedPhotoIds.has(photo.id)}
              showOnMapLabel={t('journey.showOnMap')}
              src={photo.url}
              tags={tagsByPhotoId?.get(photo.id) ?? []}
              {...(typeof meta?.width === 'number'
                ? { width: meta.width }
                : {})}
            />
          )
        })}
      </div>
      {lightboxElement}
    </>
  )
}

function isJourneyGalleryPreviews(
  value: unknown,
): value is JourneyGalleryPreviews {
  return (
    typeof value === 'object' &&
    value !== null &&
    'failedMomentCount' in value &&
    'previewsByEntry' in value &&
    'previewsByMoment' in value
  )
}
