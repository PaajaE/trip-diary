import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getJourneyEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import {
  loadJourneyGalleryPreviews,
  mergeJourneyGalleryPhotos,
  type JourneyGalleryMoment,
  type JourneyGalleryPreviews,
} from '@/features/journeys/lib/journey-gallery'

interface JourneyGalleryProps {
  locatedPhotoIds: ReadonlySet<string>
  moments: JourneyGalleryMoment[]
  onShowOnMap: (photoId: string) => void
}

function JourneyGalleryImage({
  alt,
  entryId,
  onShowOnMap,
  photoId,
  showOnMap,
  showOnMapLabel,
  src,
}: {
  alt: string
  entryId: string
  onShowOnMap: (photoId: string) => void
  photoId: string
  showOnMap: boolean
  showOnMapLabel: string
  src: string
}) {
  const [isBroken, setIsBroken] = useState(false)

  if (isBroken) {
    return null
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-surface shadow-soft">
      <Link
        aria-label={alt}
        className="block"
        params={{ entryId }}
        to="/e/$entryId"
      >
        <img
          alt={alt}
          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          onError={() => {
            setIsBroken(true)
          }}
          src={src}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-sm font-semibold text-white">
          {alt}
        </span>
      </Link>
      {showOnMap ? (
        <button
          aria-label={showOnMapLabel}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition hover:bg-background"
          onClick={() => {
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
  locatedPhotoIds,
  moments,
  onShowOnMap,
}: JourneyGalleryProps) {
  const { t } = useTranslation()
  const previewsQuery = useQuery({
    queryFn: () => loadJourneyGalleryPreviews(moments, getJourneyEntryPhotoPreviews),
    queryKey: ['journey-gallery', ...moments.map((moment) => moment.entry.id)],
  })
  const previewData = isJourneyGalleryPreviews(previewsQuery.data)
    ? previewsQuery.data
    : null
  const photos = useMemo(
    () =>
      mergeJourneyGalleryPhotos(moments, previewData?.previewsByMoment ?? []),
    [moments, previewData?.previewsByMoment],
  )
  const urls = usePhotoObjectUrls(photos)

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

  return (
    <>
      {hasPartialError ? (
        <p className="mt-8 text-sm text-muted" role="status">
          {t('journey.galleryPartialError')}
        </p>
      ) : null}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((photo) => (
          <JourneyGalleryImage
            alt={photo.entryTitle ?? t('journey.galleryUntitled')}
            entryId={photo.entryId}
            key={`${photo.entryId}:${photo.id}`}
            onShowOnMap={onShowOnMap}
            photoId={photo.id}
            showOnMap={locatedPhotoIds.has(photo.id)}
            showOnMapLabel={t('journey.showOnMap')}
            src={photo.url}
          />
        ))}
      </div>
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
    'previewsByMoment' in value
  )
}
