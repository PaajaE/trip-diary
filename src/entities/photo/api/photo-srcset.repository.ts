import {
  PHOTO_SRCSET_WIDTHS,
  type CanonicalPhotoVariant,
} from '@trip-diary/utils'
import type { PhotoSrcsetSource } from '@/entities/photo/lib/responsive-photo'
import { getSupabaseClient } from '@/shared/api/supabase'

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

/** Hero/cover presentation: allow retina without always shipping masters alone. */
export const MOMENT_HERO_SRCSET_VARIANTS = [
  'small',
  'medium',
  'full',
] as const satisfies readonly CanonicalPhotoVariant[]

function canonicalizeVariantName(
  variant: string,
): CanonicalPhotoVariant | null {
  if (variant === 'preview' || variant === 'large') {
    return 'full'
  }
  if (
    variant === 'thumb' ||
    variant === 'small' ||
    variant === 'medium' ||
    variant === 'full'
  ) {
    return variant
  }
  return null
}

/**
 * Signed-URL srcset sources for a photo, limited to the requested canonical
 * variants (legacy preview/large map to full).
 */
export async function getPhotoSrcsetSources(
  photoId: string,
  variants: readonly CanonicalPhotoVariant[] = MOMENT_HERO_SRCSET_VARIANTS,
): Promise<PhotoSrcsetSource[]> {
  const allowed = new Set<CanonicalPhotoVariant>(variants)
  const client = getSupabaseClient()
  const queryVariants: (CanonicalPhotoVariant | 'preview' | 'large')[] = [
    ...allowed,
  ]
  if (allowed.has('full')) {
    queryVariants.push('preview', 'large')
  }

  const { data, error } = await client
    .from('photo_variants')
    .select('storage_path, variant')
    .eq('photo_id', photoId)
    .in('variant', queryVariants)

  if (error !== null) {
    throw error
  }

  const bestByVariant = new Map<
    CanonicalPhotoVariant,
    { isCanonicalRow: boolean; storagePath: string }
  >()

  for (const row of data) {
    const canonical = canonicalizeVariantName(row.variant)
    if (canonical === null || !allowed.has(canonical)) {
      continue
    }
    const isCanonicalRow = row.variant === canonical
    const existing = bestByVariant.get(canonical)
    if (
      existing === undefined ||
      (isCanonicalRow && !existing.isCanonicalRow)
    ) {
      bestByVariant.set(canonical, {
        isCanonicalRow,
        storagePath: row.storage_path,
      })
    }
  }

  const sources: PhotoSrcsetSource[] = []
  for (const { variant, width } of PHOTO_SRCSET_WIDTHS) {
    if (!allowed.has(variant)) {
      continue
    }
    const match = bestByVariant.get(variant)
    if (match === undefined) {
      continue
    }
    const { data: signed, error: signError } = await client.storage
      .from('photos')
      .createSignedUrl(match.storagePath, SIGNED_URL_TTL_SECONDS)
    if (signError !== null || typeof signed.signedUrl !== 'string') {
      continue
    }
    sources.push({ url: signed.signedUrl, width })
  }

  return sources
}
