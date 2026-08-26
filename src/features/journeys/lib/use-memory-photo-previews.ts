import { useEffect, useRef, useState } from 'react'
import {
  PHOTO_VARIANT_PREFERENCE,
  pickPreferredPhotoVariant,
} from '@trip-diary/utils'
import type {
  ProcessedPhoto,
  SelectedPhotoFile,
} from '@/entities/photo/lib/process-photo'
import {
  createPreviewUrl,
  revokePreviewUrl,
  schedulePreviewUrlRevoke,
  shouldWaitForProcessedVariantsOnNative,
} from '@/shared/lib/preview-url'

export interface MemoryPhotoPreview {
  id: string
  url: string
}

function pickPreviewSource(
  photo: SelectedPhotoFile,
  processed: ProcessedPhoto | undefined,
): { blob: Blob; id: string } | null {
  const match =
    processed === undefined
      ? null
      : pickPreferredPhotoVariant(
          processed.variants.map((variant) => ({
            ...variant,
            variant: variant.kind,
          })),
          PHOTO_VARIANT_PREFERENCE.tiny,
        )

  if (match !== null) {
    return {
      blob: match.blob,
      id: match.kind,
    }
  }

  // On native, only show processed thumbs — originals can be 10MB+ and break
  // data URLs in WKWebView / Android WebView.
  if (shouldWaitForProcessedVariantsOnNative()) {
    return null
  }

  if (photo.file.size === 0) {
    return null
  }

  return {
    blob: photo.file,
    id: 'original',
  }
}

export function useMemoryPhotoPreviews(
  photos: SelectedPhotoFile[],
  detectedPhotos: ProcessedPhoto[],
): MemoryPhotoPreview[] {
  const [previews, setPreviews] = useState<MemoryPhotoPreview[]>([])
  const pendingRevocations = useRef(new Map<string, number>())

  useEffect(() => {
    const cancelledRef = { current: false }

    void (async () => {
      const next = (
        await Promise.all(
          photos.map(async (photo, index) => {
            const source = pickPreviewSource(photo, detectedPhotos[index])
            if (source === null) {
              return null
            }

            try {
              const url = await createPreviewUrl(source.blob)
              return {
                id: `${String(index)}-${source.id}`,
                url,
              }
            } catch {
              return null
            }
          }),
        )
      ).flatMap((preview) => (preview === null ? [] : [preview]))

      if (cancelledRef.current) {
        for (const preview of next) {
          revokePreviewUrl(preview.url)
        }
        return
      }

      setPreviews((previous) => {
        for (const preview of previous) {
          if (!next.some((candidate) => candidate.url === preview.url)) {
            schedulePreviewUrlRevoke(pendingRevocations.current, preview.url)
          }
        }
        return next
      })
    })()

    return () => {
      cancelledRef.current = true
    }
  }, [detectedPhotos, photos])

  useEffect(
    () => () => {
      for (const preview of previews) {
        revokePreviewUrl(preview.url)
      }
    },
    [previews],
  )

  return previews
}
