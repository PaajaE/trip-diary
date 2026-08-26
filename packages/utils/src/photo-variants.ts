/**
 * Canonical photo variant policy shared by web, mobile, and maintenance scripts.
 *
 * Semantic model:
 *   thumb  ~220px  — tiny grids / strips
 *   small  ~800px  — cards / feeds / inline
 *   medium ~1600px — fullscreen / retina
 *   full   ≤2560 (panorama ≤4096) — zoom / master
 *
 * Legacy aliases still present in DB/Storage for older rows:
 *   preview ≡ full
 *   large   ≡ unused historical enum value (treated like full in fallbacks)
 */

export type CanonicalPhotoVariant = 'thumb' | 'small' | 'medium' | 'full'
export type LegacyPhotoVariant = 'preview' | 'large'
export type PhotoVariantKind = CanonicalPhotoVariant | LegacyPhotoVariant

export type PhotoDisplayContext =
  | 'tiny'
  | 'card'
  | 'inline'
  | 'fullscreen'
  | 'zoom'

export interface PhotoDimensions {
  height: number
  width: number
}

export interface NormalizedDimensionPlan extends PhotoDimensions {
  isPanorama: boolean
  maxLongestEdge: number
  maxPixels: number
}

export interface PhotoVariantSizePolicy {
  jpegQuality: number
  maxLongestEdge: number
}

/** Normal phone photos: longest edge cap for the master/full variant. */
export const FULL_MAX_LONGEST_EDGE = 2560

/** Ultra-wide / panorama longest-edge allowance for full. */
export const FULL_PANORAMA_MAX_LONGEST_EDGE = 4096

/** Aspect ratio (long/short) at or above this is treated as panorama. */
export const PANORAMA_ASPECT_RATIO_THRESHOLD = 1.8

export const FULL_MAX_PIXELS = 8_000_000
export const FULL_PANORAMA_MAX_PIXELS = 12_000_000

export const FULL_JPEG_QUALITY = 0.82

export const PHOTO_VARIANT_POLICY: Record<
  CanonicalPhotoVariant,
  PhotoVariantSizePolicy
> = {
  thumb: { maxLongestEdge: 220, jpegQuality: 0.72 },
  small: { maxLongestEdge: 800, jpegQuality: 0.75 },
  medium: { maxLongestEdge: 1600, jpegQuality: 0.78 },
  full: { maxLongestEdge: FULL_MAX_LONGEST_EDGE, jpegQuality: FULL_JPEG_QUALITY },
}

/** Variants written by current clients for new uploads. */
export const UPLOAD_PHOTO_VARIANTS: readonly CanonicalPhotoVariant[] = [
  'thumb',
  'small',
  'medium',
  'full',
] as const

/**
 * Preference chains for display contexts.
 * Legacy `preview` / `large` remain as fallbacks for older rows.
 */
export const PHOTO_VARIANT_PREFERENCE: Record<
  PhotoDisplayContext,
  readonly PhotoVariantKind[]
> = {
  tiny: ['thumb', 'small', 'medium', 'full', 'preview', 'large'],
  card: ['small', 'thumb', 'medium', 'full', 'preview', 'large'],
  inline: ['small', 'medium', 'full', 'preview', 'thumb', 'large'],
  fullscreen: ['medium', 'full', 'preview', 'large', 'small', 'thumb'],
  zoom: ['full', 'preview', 'large', 'medium', 'small', 'thumb'],
}

const ALL_VARIANT_KINDS = new Set<string>([
  'thumb',
  'small',
  'medium',
  'full',
  'preview',
  'large',
])

export function isPhotoVariantKind(value: string): value is PhotoVariantKind {
  return ALL_VARIANT_KINDS.has(value)
}

export function isCanonicalPhotoVariant(
  value: string,
): value is CanonicalPhotoVariant {
  return (
    value === 'thumb' ||
    value === 'small' ||
    value === 'medium' ||
    value === 'full'
  )
}

/** Map legacy names onto the canonical semantic variant. */
export function canonicalizePhotoVariant(
  variant: PhotoVariantKind,
): CanonicalPhotoVariant {
  if (variant === 'preview' || variant === 'large') {
    return 'full'
  }
  return variant
}

export function isPanoramaDimensions(width: number, height: number): boolean {
  const w = Math.max(1, Math.trunc(width))
  const h = Math.max(1, Math.trunc(height))
  const longEdge = Math.max(w, h)
  const shortEdge = Math.min(w, h)
  return longEdge / shortEdge >= PANORAMA_ASPECT_RATIO_THRESHOLD
}

/**
 * Scale so longest edge (and for full, total pixels) stay within policy.
 * Never upscales. Preserves aspect ratio.
 */
export function resolveVariantDimensions(
  source: PhotoDimensions,
  maxLongestEdge: number,
): PhotoDimensions {
  const width = Math.max(1, Math.trunc(source.width))
  const height = Math.max(1, Math.trunc(source.height))
  const longest = Math.max(width, height)

  if (longest <= maxLongestEdge) {
    return { height, width }
  }

  const scale = maxLongestEdge / longest
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

export function resolveNormalizedDimensions(
  source: PhotoDimensions,
): NormalizedDimensionPlan {
  const width = Math.max(1, Math.trunc(source.width))
  const height = Math.max(1, Math.trunc(source.height))
  const panorama = isPanoramaDimensions(width, height)
  const maxLongestEdge = panorama
    ? FULL_PANORAMA_MAX_LONGEST_EDGE
    : FULL_MAX_LONGEST_EDGE
  const maxPixels = panorama ? FULL_PANORAMA_MAX_PIXELS : FULL_MAX_PIXELS

  let next = resolveVariantDimensions({ width, height }, maxLongestEdge)
  const pixels = next.width * next.height
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels)
    next = {
      width: Math.max(1, Math.round(next.width * scale)),
      height: Math.max(1, Math.round(next.height * scale)),
    }
  }

  return {
    height: next.height,
    isPanorama: panorama,
    maxLongestEdge,
    maxPixels,
    width: next.width,
  }
}

export function resolveThumbDimensions(source: PhotoDimensions): PhotoDimensions {
  return resolveVariantDimensions(
    source,
    PHOTO_VARIANT_POLICY.thumb.maxLongestEdge,
  )
}

export function resolveSmallDimensions(source: PhotoDimensions): PhotoDimensions {
  return resolveVariantDimensions(
    source,
    PHOTO_VARIANT_POLICY.small.maxLongestEdge,
  )
}

export function resolveMediumDimensions(
  source: PhotoDimensions,
): PhotoDimensions {
  return resolveVariantDimensions(
    source,
    PHOTO_VARIANT_POLICY.medium.maxLongestEdge,
  )
}

export function buildPhotoStoragePath(
  creatorId: string,
  photoId: string,
  variant: PhotoVariantKind,
  extension: 'jpg' | 'webp' = 'jpg',
): string {
  return `${creatorId}/${photoId}/${variant}.${extension}`
}

export function pickPreferredPhotoVariant<T extends { variant: string }>(
  variants: readonly T[],
  preference: readonly PhotoVariantKind[],
): T | null {
  const byKind = new Map<string, T>()
  for (const variant of variants) {
    if (isPhotoVariantKind(variant.variant)) {
      // First wins; do not overwrite a preferred explicit row with a later alias.
      if (!byKind.has(variant.variant)) {
        byKind.set(variant.variant, variant)
      }
    }
  }

  for (const kind of preference) {
    const match = byKind.get(kind)
    if (match !== undefined) {
      return match
    }
  }

  return null
}

export function pickPhotoVariantForContext<T extends { variant: string }>(
  variants: readonly T[],
  context: PhotoDisplayContext,
): T | null {
  return pickPreferredPhotoVariant(variants, PHOTO_VARIANT_PREFERENCE[context])
}

export function pickPhotoVariantPath(
  variants: readonly {
    storagePath?: string
    storage_path?: string
    variant: string
  }[],
  context: PhotoDisplayContext,
): string | null {
  const normalized = variants.map((variant) => ({
    variant: variant.variant,
    storagePath: variant.storagePath ?? variant.storage_path ?? '',
  }))
  const match = pickPhotoVariantForContext(normalized, context)
  if (match === null || match.storagePath.trim().length === 0) {
    return null
  }
  return match.storagePath
}

/** Responsive srcset widths aligned to canonical longest-edge targets. */
export const PHOTO_SRCSET_WIDTHS: readonly {
  variant: CanonicalPhotoVariant
  width: number
}[] = [
  { variant: 'thumb', width: PHOTO_VARIANT_POLICY.thumb.maxLongestEdge },
  { variant: 'small', width: PHOTO_VARIANT_POLICY.small.maxLongestEdge },
  { variant: 'medium', width: PHOTO_VARIANT_POLICY.medium.maxLongestEdge },
  { variant: 'full', width: PHOTO_VARIANT_POLICY.full.maxLongestEdge },
]

/**
 * True when an existing thumb row looks like the temporary ~800px backfill
 * (or older mobile thumb) rather than the canonical ~220px thumb.
 */
export function isOversizedThumbVariant(width: number, height: number): boolean {
  return Math.max(width, height) >= 400
}
