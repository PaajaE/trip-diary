import {
  pickPhotoVariantPath,
  type PhotoDisplayContext,
  type PhotoVariantKind,
} from '@trip-diary/utils'

export type { PhotoVariantKind }

export interface PhotoVariantPath {
  photoId: string
  storagePath: string
  variant: PhotoVariantKind
}

export function pickPreferredPhotoVariantPath(
  variants: ReadonlyArray<{
    photoId: string
    storagePath: string
    variant: string
  }>,
  context: PhotoDisplayContext = 'card',
): string | null {
  return pickPhotoVariantPath(variants, context)
}

export function pickCardPhotoVariantPath(
  variants: ReadonlyArray<{
    photoId: string
    storagePath: string
    variant: string
  }>,
): string | null {
  return pickPhotoVariantPath(variants, 'card')
}

export function pickTinyPhotoVariantPath(
  variants: ReadonlyArray<{
    photoId: string
    storagePath: string
    variant: string
  }>,
): string | null {
  return pickPhotoVariantPath(variants, 'tiny')
}

export function pickDetailPhotoVariantPath(
  variants: ReadonlyArray<{
    photoId: string
    storagePath: string
    variant: string
  }>,
): string | null {
  return pickPhotoVariantPath(variants, 'fullscreen')
}

export function pickZoomPhotoVariantPath(
  variants: ReadonlyArray<{
    photoId: string
    storagePath: string
    variant: string
  }>,
): string | null {
  return pickPhotoVariantPath(variants, 'zoom')
}

export function groupVariantsByPhotoId(
  rows: ReadonlyArray<{
    photo_id: string
    storage_path: string
    variant: string
  }>,
): Map<
  string,
  Array<{ photoId: string; storagePath: string; variant: string }>
> {
  const grouped = new Map<
    string,
    Array<{ photoId: string; storagePath: string; variant: string }>
  >()

  for (const row of rows) {
    const photoId = row.photo_id
    const list = grouped.get(photoId) ?? []
    list.push({
      photoId,
      storagePath: row.storage_path,
      variant: row.variant,
    })
    grouped.set(photoId, list)
  }

  return grouped
}
