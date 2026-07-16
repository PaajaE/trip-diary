import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import { setEntryCoverPhoto } from '@/entities/photo/api/photo-mutation.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { useToast } from '@/shared/ui/use-toast'
import { cn } from '@/shared/lib/cn'

interface EntryPhotoGridProps {
  alt: string
  canDelete?: boolean
  canEditTags?: boolean
  canSetCover?: boolean
  creatorId?: string
  entryId: string
  journeyId?: string
  onCoverChanged?: () => void
  onOpenMoment?: (entryId: string) => void
  photos: PhotoPreview[]
  showPhotoEngagement?: boolean
  tagsByPhotoId?: Map<string, PhotoTagAssignment[]>
}

function GridImage({
  alt,
  coverLabel,
  isCover,
  onOpen,
  onSetCover,
  setCoverLabel,
  src,
}: {
  alt: string
  coverLabel: string
  isCover: boolean
  onOpen: () => void
  onSetCover?: () => void
  setCoverLabel: string
  src: string
}) {
  const [isBroken, setIsBroken] = useState(false)

  if (isBroken) {
    return null
  }

  return (
    <div className="relative">
      <button
        aria-label={alt}
        className={cn(
          'block w-full overflow-hidden rounded-md focus-visible:outline-offset-2',
          isCover && 'ring-2 ring-primary ring-offset-2',
        )}
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
      {isCover ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          {coverLabel}
        </span>
      ) : null}
      {onSetCover !== undefined && !isCover ? (
        <button
          aria-label={setCoverLabel}
          className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          onClick={(event) => {
            event.stopPropagation()
            onSetCover()
          }}
          type="button"
        >
          {setCoverLabel}
        </button>
      ) : null}
    </div>
  )
}

export function EntryPhotoGrid({
  alt,
  canDelete = false,
  canEditTags = false,
  canSetCover = false,
  creatorId,
  entryId,
  journeyId,
  onCoverChanged,
  onOpenMoment,
  photos,
  showPhotoEngagement = false,
  tagsByPhotoId,
}: EntryPhotoGridProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
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

  const coverMutation = useMutation({
    mutationFn: (photoId: string) => setEntryCoverPhoto(entryId, photoId),
    onError: () => {
      showToast({ message: t('entry.coverUpdateFailed'), variant: 'error' })
    },
    onSuccess: async () => {
      if (journeyId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: journeyQueryKeys.detail(journeyId),
        })
      }
      onCoverChanged?.()
      showToast({ message: t('entry.coverUpdated'), variant: 'default' })
    },
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

  const coverId =
    photos.find((photo) => photo.isCover === true)?.id ?? photos[0]?.id ?? null

  const lightboxPhotos = urls.map((preview) => ({
    alt,
    entryId,
    id: preview.id,
    thumbUrl: preview.url,
  }))

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((preview, previewIndex) => {
          const isCover = preview.id === coverId
          return (
            <GridImage
              alt={`${alt} ${String(previewIndex + 1)}`}
              coverLabel={t('entry.coverPhoto')}
              isCover={isCover}
              key={preview.id}
              onOpen={() => {
                openLightbox(lightboxPhotos, previewIndex)
              }}
              {...(canSetCover && !isCover
                ? {
                    onSetCover: () => {
                      coverMutation.mutate(preview.id)
                    },
                  }
                : {})}
              setCoverLabel={t('entry.setCoverPhoto')}
              src={preview.url}
            />
          )
        })}
      </div>
      {lightboxElement}
    </>
  )
}
