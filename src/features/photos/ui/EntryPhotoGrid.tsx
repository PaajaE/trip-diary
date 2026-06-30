import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'

interface EntryPhotoGridProps {
  alt: string
  canDelete?: boolean
  canEditTags?: boolean
  creatorId?: string
  entryId: string
  journeyId?: string
  onOpenMoment?: (entryId: string) => void
  photos: PhotoPreview[]
  showPhotoEngagement?: boolean
  tagsByPhotoId?: Map<string, PhotoTagAssignment[]>
}

function GridImage({
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
        decoding="async"
        loading="lazy"
        onError={() => {
          setIsBroken(true)
        }}
        src={src}
      />
    </button>
  )
}

export function EntryPhotoGrid({
  alt,
  canDelete = false,
  canEditTags = false,
  creatorId,
  entryId,
  journeyId,
  onOpenMoment,
  photos,
  showPhotoEngagement = false,
  tagsByPhotoId,
}: EntryPhotoGridProps) {
  const { t } = useTranslation()
  const urls = usePhotoObjectUrls(photos)
  const { lightboxElement, openLightbox } = usePhotoLightbox({
    canDelete,
    canEditTags: canEditTags && journeyId !== undefined,
    ...(creatorId !== undefined ? { creatorId } : {}),
    ...(journeyId !== undefined ? { journeyId } : {}),
    ...(onOpenMoment !== undefined ? { onOpenMoment } : {}),
    photoEngagement: showPhotoEngagement,
    ...(tagsByPhotoId !== undefined ? { tagsByPhotoId } : {}),
  })

  if (photos.length > 0 && urls.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted" role="status">
        {t('photos.loading')}
      </p>
    )
  }

  if (urls.length === 0) {
    return null
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
          <GridImage
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
