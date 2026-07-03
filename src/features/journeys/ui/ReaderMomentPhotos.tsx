import { useState } from 'react'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'

interface ReaderMomentPhotosProps {
  alt: string
  entryId: string
  featured?: boolean
  photos: PhotoPreview[]
  showPhotoEngagement?: boolean
  tagsByPhotoId?: Map<string, PhotoTagAssignment[]>
}

function ReaderPhoto({
  alt,
  className,
  fetchPriority,
  loading = 'lazy',
  onOpen,
  src,
}: {
  alt: string
  className?: string
  fetchPriority?: 'high' | 'low' | 'auto'
  loading?: 'eager' | 'lazy'
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
      className={className}
      onClick={onOpen}
      type="button"
    >
      <img
        alt=""
        aria-hidden="true"
        className="size-full object-cover transition-transform duration-500 hover:scale-[1.02]"
        decoding="async"
        {...(fetchPriority !== undefined ? { fetchPriority } : {})}
        loading={loading}
        onError={() => {
          setIsBroken(true)
        }}
        src={src}
      />
    </button>
  )
}

export function ReaderMomentPhotos({
  alt,
  entryId,
  featured = false,
  photos,
  showPhotoEngagement = false,
  tagsByPhotoId,
}: ReaderMomentPhotosProps) {
  const urls = usePhotoObjectUrls(photos)
  const { lightboxElement, openLightbox } = usePhotoLightbox({
    photoEngagement: showPhotoEngagement,
    ...(tagsByPhotoId !== undefined ? { tagsByPhotoId } : {}),
  })

  if (photos.length > 0 && urls.length === 0) {
    return (
      <div
        aria-hidden="true"
        className={
          featured
            ? 'reader-bleed reader-photo-placeholder reader-photo-feature mt-8'
            : 'reader-photo-placeholder mt-6 aspect-square rounded-2xl'
        }
      />
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

  const openAt = (index: number) => {
    openLightbox(lightboxPhotos, index)
  }

  if (featured && urls.length === 1) {
    const firstPhoto = urls[0]
    if (firstPhoto === undefined) {
      return null
    }
    return (
      <>
        <div className="reader-bleed mt-8">
          <ReaderPhoto
            alt={alt}
            className="reader-photo-feature block w-full overflow-hidden"
            fetchPriority="high"
            loading="eager"
            onOpen={() => {
              openAt(0)
            }}
            src={firstPhoto.url}
          />
        </div>
        {lightboxElement}
      </>
    )
  }

  if (featured && urls.length >= 2) {
    const firstPhoto = urls[0]
    if (firstPhoto === undefined) {
      return null
    }
    const rest = urls.slice(1)
    return (
      <>
        <div className="reader-bleed mt-8">
          <ReaderPhoto
            alt={alt}
            className="reader-photo-feature block w-full overflow-hidden"
            fetchPriority="high"
            loading="eager"
            onOpen={() => {
              openAt(0)
            }}
            src={firstPhoto.url}
          />
        </div>
        {rest.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rest.map((preview, index) => (
              <ReaderPhoto
                alt={alt}
                className="reader-photo-tile block aspect-[4/3] overflow-hidden rounded-2xl"
                key={preview.id}
                onOpen={() => {
                  openAt(index + 1)
                }}
                src={preview.url}
              />
            ))}
          </div>
        ) : null}
        {lightboxElement}
      </>
    )
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {urls.map((preview, index) => (
          <ReaderPhoto
            alt={alt}
            className="reader-photo-tile block aspect-square overflow-hidden rounded-2xl"
            key={preview.id}
            onOpen={() => {
              openAt(index)
            }}
            src={preview.url}
          />
        ))}
      </div>
      {lightboxElement}
    </>
  )
}
