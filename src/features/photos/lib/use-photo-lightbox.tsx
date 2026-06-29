import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import { deletePhoto } from '@/entities/photo/api/photo-mutation.repository'
import {
  PhotoLightbox,
  type PhotoLightboxItem,
} from '@/features/photos/ui/PhotoLightbox'

export function usePhotoLightbox(options?: {
  canDelete?: boolean
  canEditTags?: boolean
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

  const openLightbox = useCallback(
    (photos: PhotoLightboxItem[], index: number) => {
      setLightbox({ index, photos })
    },
    [],
  )

  const closeLightbox = useCallback(() => {
    setLightbox(null)
  }, [])

  const lightboxElement =
    lightbox === null ? null : (
      <PhotoLightbox
        canDelete={options?.canDelete === true && options.creatorId !== undefined}
        canEditTags={
          options?.canEditTags === true &&
          options.creatorId !== undefined &&
          options.journeyId !== undefined
        }
        initialIndex={lightbox.index}
        onClose={closeLightbox}
        {...(options?.creatorId !== undefined
          ? {
              creatorId: options.creatorId,
              onDelete: async (photoId: string) => {
                await deletePhoto(photoId, options.creatorId!)
                await queryClient.invalidateQueries()
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
          void queryClient.invalidateQueries({
            queryKey: ['journey-photo-tags'],
          })
        }}
        photoEngagement={options?.photoEngagement === true}
        photos={lightbox.photos}
      />
    )

  return { closeLightbox, lightboxElement, openLightbox }
}
