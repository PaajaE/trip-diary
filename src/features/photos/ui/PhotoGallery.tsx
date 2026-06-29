import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'

interface PhotoGalleryProps {
  alt: string
  canDelete?: boolean
  creatorId?: string
  entryId: string
  onOpenMoment?: (entryId: string) => void
  showEmpty?: boolean
}

function GalleryImage({
  alt,
  onOpen,
  src,
}: {
  alt: string
  onOpen: () => void
  src: string
}) {
  const [isBroken, setIsBroken] = useState(false)

  if (isBroken) {
    return null
  }

  return (
    <button
      aria-label={alt}
      className="block w-full overflow-hidden rounded-md focus-visible:outline-offset-2"
      onClick={onOpen}
      type="button"
    >
      <img
        alt=""
        aria-hidden="true"
        className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
        loading="lazy"
        onError={() => {
          setIsBroken(true)
        }}
        src={src}
      />
    </button>
  )
}

export function PhotoGallery({
  alt,
  canDelete = false,
  creatorId,
  entryId,
  onOpenMoment,
  showEmpty = true,
}: PhotoGalleryProps) {
  const { t } = useTranslation()
  const previewsQuery = useQuery({
    queryKey: ['entries', entryId, 'photo-previews'],
    queryFn: () => getEntryPhotoPreviews(entryId),
  })
  const urls = usePhotoObjectUrls(previewsQuery.data ?? [])
  const { lightboxElement, openLightbox } = usePhotoLightbox({
    canDelete,
    ...(creatorId !== undefined ? { creatorId } : {}),
    ...(onOpenMoment !== undefined ? { onOpenMoment } : {}),
  })

  if (previewsQuery.isPending) {
    return (
      <p className="mt-8 text-sm text-muted" role="status">
        {t('photos.loading')}
      </p>
    )
  }

  if (previewsQuery.isError) {
    return (
      <p className="mt-8 text-sm text-destructive" role="alert">
        {t('photos.error')}
      </p>
    )
  }

  if (urls.length === 0) {
    return showEmpty ? (
      <p className="mt-8 text-sm text-muted">{t('photos.empty')}</p>
    ) : null
  }

  const lightboxPhotos = urls.map((preview) => ({
    alt,
    entryId,
    id: preview.id,
    thumbUrl: preview.url,
  }))

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((preview, previewIndex) => (
          <GalleryImage
            alt={alt}
            key={preview.id}
            onOpen={() => {
              openLightbox(lightboxPhotos, previewIndex)
            }}
            src={preview.url}
          />
        ))}
      </div>
      {lightboxElement}
    </>
  )
}
