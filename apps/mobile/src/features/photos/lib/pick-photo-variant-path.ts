export type PhotoVariantKind = 'thumb' | 'preview' | 'large'

export interface PhotoVariantPath {
  photoId: string
  storagePath: string
  variant: PhotoVariantKind
}

const CARD_VARIANT_PREFERENCE: readonly PhotoVariantKind[] = [
  'thumb',
  'preview',
  'large',
]

const DETAIL_VARIANT_PREFERENCE: readonly PhotoVariantKind[] = [
  'preview',
  'large',
  'thumb',
]

export function pickPreferredPhotoVariantPath(
  variants: ReadonlyArray<{
    photoId: string
    storagePath: string
    variant: string
  }>,
  preference: readonly PhotoVariantKind[] = CARD_VARIANT_PREFERENCE,
): string | null {
  const byKind = new Map<string, string>()
  for (const variant of variants) {
    if (
      variant.variant === 'thumb' ||
      variant.variant === 'preview' ||
      variant.variant === 'large'
    ) {
      byKind.set(variant.variant, variant.storagePath)
    }
  }

  for (const kind of preference) {
    const path = byKind.get(kind)
    if (path !== undefined && path.trim().length > 0) {
      return path
    }
  }

  return null
}

export function pickCardPhotoVariantPath(
  variants: ReadonlyArray<{
    photoId: string
    storagePath: string
    variant: string
  }>,
): string | null {
  return pickPreferredPhotoVariantPath(variants, CARD_VARIANT_PREFERENCE)
}

export function pickDetailPhotoVariantPath(
  variants: ReadonlyArray<{
    photoId: string
    storagePath: string
    variant: string
  }>,
): string | null {
  return pickPreferredPhotoVariantPath(variants, DETAIL_VARIANT_PREFERENCE)
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
