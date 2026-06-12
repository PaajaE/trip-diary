import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { getEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import {
  loadJourneyGalleryPreviews,
  mergeJourneyGalleryPhotos,
  type JourneyGalleryMoment,
  type JourneyGalleryPreviews,
} from '@/features/journeys/lib/journey-gallery'

interface JourneyGalleryProps {
  moments: JourneyGalleryMoment[]
}

function JourneyGalleryImage({
  alt,
  entryId,
  src,
}: {
  alt: string
  entryId: string
  src: string
}) {
  const [isBroken, setIsBroken] = useState(false)

  if (isBroken) {
    return null
  }

  return (
    <Link
      aria-label={`Otevřít moment ${alt}`}
      className="group relative block overflow-hidden rounded-2xl bg-surface shadow-soft"
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
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {alt}
      </span>
    </Link>
  )
}

export function JourneyGallery({ moments }: JourneyGalleryProps) {
  const previewsQuery = useQuery({
    queryFn: () => loadJourneyGalleryPreviews(moments, getEntryPhotoPreviews),
    queryKey: ['journey-gallery', ...moments.map((moment) => moment.entry.id)],
  })
  const previewData = isJourneyGalleryPreviews(previewsQuery.data)
    ? previewsQuery.data
    : null
  const photos = mergeJourneyGalleryPhotos(
    moments,
    previewData?.previewsByMoment ?? [],
  )
  const urls = useMemo(
    () =>
      photos.map((photo) => ({
        ...photo,
        url: URL.createObjectURL(photo.blob),
      })),
    [photos],
  )

  useEffect(
    () => () => {
      for (const photo of urls) {
        URL.revokeObjectURL(photo.url)
      }
    },
    [urls],
  )

  const hasPartialError = (previewData?.failedMomentCount ?? 0) > 0

  if (previewsQuery.isPending && urls.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted" role="status">
        Načítám galerii cesty…
      </p>
    )
  }

  if (previewsQuery.isError && urls.length === 0) {
    return (
      <p className="mt-8 text-sm text-destructive" role="alert">
        Galerii cesty se nepodařilo načíst.
      </p>
    )
  }

  if (urls.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted">
        V této cestě zatím nejsou žádné fotografie.
      </p>
    )
  }

  return (
    <>
      {hasPartialError ? (
        <p className="mt-8 text-sm text-muted" role="status">
          Některé fotografie se nepodařilo načíst.
        </p>
      ) : null}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((photo) => (
          <JourneyGalleryImage
            alt={photo.entryTitle ?? 'Moment cesty'}
            entryId={photo.entryId}
            key={`${photo.entryId}:${photo.id}`}
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
