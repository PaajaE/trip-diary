import { useEffect, useRef, useState } from 'react'
import {
  createPreviewUrl,
  revokePreviewUrl,
  schedulePreviewUrlRevoke,
} from '@/shared/lib/preview-url'

export function usePhotoObjectUrls<T extends { blob: Blob; id: string }>(
  photos: T[],
): (T & { url: string })[] {
  const pendingRevocations = useRef(new Map<string, number>())
  const [urlsById, setUrlsById] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const next: Record<string, string> = {}
      const batchSize = 3

      for (let index = 0; index < photos.length; index += batchSize) {
        if (cancelled) {
          return
        }

        const batch = photos.slice(index, index + batchSize)
        await Promise.all(
          batch.map(async (photo) => {
            try {
              next[photo.id] = await createPreviewUrl(photo.blob)
            } catch {
              // Skip previews that cannot be rendered.
            }
          }),
        )

        if (cancelled) {
          for (const url of Object.values(next)) {
            revokePreviewUrl(url)
          }
          return
        }

        setUrlsById((previous) => {
          const merged = { ...previous, ...next }
          for (const [id, url] of Object.entries(previous)) {
            if (merged[id] === undefined) {
              schedulePreviewUrlRevoke(pendingRevocations.current, url)
            }
          }
          return merged
        })

        if (index + batchSize < photos.length) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 0)
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [photos])

  useEffect(
    () => () => {
      for (const url of Object.values(urlsById)) {
        revokePreviewUrl(url)
      }
    },
    [urlsById],
  )

  return photos.flatMap((photo) => {
    const url = urlsById[photo.id]
    return url === undefined ? [] : [{ ...photo, url }]
  })
}
