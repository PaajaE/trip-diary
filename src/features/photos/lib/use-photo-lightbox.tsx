import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { deletePhoto } from '@/entities/photo/api/photo-mutation.repository'
import {
  invalidateAfterPhotoDelete,
  invalidateAfterPhotoTagChange,
} from '@/entities/photo/api/invalidate-after-photo-mutation'
import {
  PhotoLightbox,
  type PhotoLightboxItem,
} from '@/features/photos/ui/PhotoLightbox'

export function usePhotoLightbox(options?: {
  canDelete?: boolean
  canEditTags?: boolean
  canLogObservation?: boolean
  creatorId?: string
  journeyId?: string
  onOpenMoment?: (entryId: string) => void
  photoEngagement?: boolean
  tagsByPhotoId?: Map<string, PhotoTagAssignment[]>
}) {
  const queryClient = useQueryClient()
  const [lightbox, setLightbox] = useState<{
    index: number
    photos: PhotoLightboxItem[]
  } | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const openLightbox = useCallback(
    (
      photos: PhotoLightboxItem[],
      index: number,
      returnFocusElement?: HTMLElement | null,
    ) => {
      returnFocusRef.current = returnFocusElement ?? null
      setLightbox({ index, photos })
    },
    [],
  )

  const closeLightbox = useCallback(() => {
    setLightbox(null)
  }, [])

  const creatorId = options?.creatorId

  const lightboxElement =
    lightbox === null ? null : (
      <PhotoLightbox
        canDelete={options?.canDelete === true && creatorId !== undefined}
        canEditTags={
          options?.canEditTags === true &&
          creatorId !== undefined &&
          options.journeyId !== undefined
        }
        canLogObservation={
          options?.canLogObservation === true &&
          creatorId !== undefined &&
          options.journeyId !== undefined
        }
        initialIndex={lightbox.index}
        onClose={closeLightbox}
        returnFocusRef={returnFocusRef}
        {...(creatorId !== undefined
          ? {
              creatorId,
              onDelete: async (photoId: string) => {
                const deletedPhoto = lightbox.photos.find(
                  (photo) => photo.id === photoId,
                )
                await deletePhoto(photoId, creatorId)
                await invalidateAfterPhotoDelete(queryClient, {
                  ...(deletedPhoto?.entryId !== undefined
                    ? { entryId: deletedPhoto.entryId }
                    : {}),
                  ...(options?.journeyId !== undefined
                    ? { journeyId: options.journeyId }
                    : {}),
                })
                setLightbox((current) => {
                  if (current === null) {
                    return null
                  }
                  const nextPhotos = current.photos.filter(
                    (photo) => photo.id !== photoId,
                  )
                  if (nextPhotos.length === 0) {
                    return null
                  }
                  return {
                    index: Math.min(current.index, nextPhotos.length - 1),
                    photos: nextPhotos,
                  }
                })
              },
            }
          : {})}
        {...(options?.journeyId !== undefined
          ? { journeyId: options.journeyId }
          : {})}
        {...(options?.onOpenMoment !== undefined
          ? { onOpenMoment: options.onOpenMoment }
          : {})}
        {...(options?.tagsByPhotoId !== undefined
          ? { tagsByPhotoId: options.tagsByPhotoId }
          : {})}
        onTagsChanged={() => {
          void invalidateAfterPhotoTagChange(queryClient, options?.journeyId)
        }}
        photoEngagement={options?.photoEngagement === true}
        photos={lightbox.photos}
      />
    )

  return { closeLightbox, lightboxElement, openLightbox }
}
