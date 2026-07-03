import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCachedPhotoObjectUrl,
  resolvePhotoObjectUrl,
} from '@/shared/lib/photo-object-url-cache'

export function usePhotoObjectUrls<T extends { blob: Blob; id: string }>(
  photos: T[],
): (T & { url: string })[] {
  const photoIdsKey = useMemo(
    () => photos.map((photo) => photo.id).join('\u0000'),
    [photos],
  )
  const [urlsById, setUrlsById] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const photo of photos) {
      const cached = getCachedPhotoObjectUrl(photo.id)
      if (cached !== undefined) {
        initial[photo.id] = cached
      }
    }
    return initial
  })

  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    const abortController = new AbortController()
    const currentPhotos = photosRef.current

    void (async () => {
      const batchSize = 4
      for (let index = 0; index < currentPhotos.length; index += batchSize) {
        if (abortController.signal.aborted) {
          return
        }

        const batch = currentPhotos.slice(index, index + batchSize)
        const resolved = await Promise.all(
          batch.map(async (photo) => {
            const url = await resolvePhotoObjectUrl(photo.id, photo.blob)
            return [photo.id, url] as const
          }),
        )

        setUrlsById((previous) => {
          const next = { ...previous }
          for (const [photoId, url] of resolved) {
            next[photoId] = url
          }
          return next
        })
      }
    })()

    return () => {
      abortController.abort()
    }
  }, [photoIdsKey])

  return photos.flatMap((photo) => {
    const url = urlsById[photo.id] ?? getCachedPhotoObjectUrl(photo.id)
    return url === undefined ? [] : [{ ...photo, url }]
  })
}
