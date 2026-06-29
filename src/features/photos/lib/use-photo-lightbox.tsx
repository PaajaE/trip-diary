import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { deletePhoto } from '@/entities/photo/api/photo-mutation.repository'
import {
  PhotoLightbox,
  type PhotoLightboxItem,
} from '@/features/photos/ui/PhotoLightbox'

export function usePhotoLightbox(options?: {
  canDelete?: boolean
  creatorId?: string
  onOpenMoment?: (entryId: string) => void
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
        initialIndex={lightbox.index}
        onClose={closeLightbox}
        {...(options?.creatorId !== undefined
          ? {
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
        {...(options?.onOpenMoment !== undefined
          ? { onOpenMoment: options.onOpenMoment }
          : {})}
        photos={lightbox.photos}
      />
    )

  return { closeLightbox, lightboxElement, openLightbox }
}
