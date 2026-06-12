import { useEffect, useMemo, useRef } from 'react'

export function usePhotoObjectUrls<T extends { blob: Blob }>(
  photos: T[],
): (T & { url: string })[] {
  const pendingRevocations = useRef(new Map<string, number>())
  const photosWithUrls = useMemo(
    () =>
      photos.map((photo) => ({
        ...photo,
        url: URL.createObjectURL(photo.blob),
      })),
    [photos],
  )

  useEffect(() => {
    const revocations = pendingRevocations.current
    for (const photo of photosWithUrls) {
      const pending = revocations.get(photo.url)
      if (pending !== undefined) {
        window.clearTimeout(pending)
        revocations.delete(photo.url)
      }
    }

    return () => {
      for (const photo of photosWithUrls) {
        revocations.set(
          photo.url,
          window.setTimeout(() => {
            URL.revokeObjectURL(photo.url)
            revocations.delete(photo.url)
          }),
        )
      }
    }
  }, [photosWithUrls])

  return photosWithUrls
}
