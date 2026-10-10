import type {
  MediaItem,
  MediaVariant,
} from '@/entities/media/model/media-library'

export const DEFAULT_MEDIA_BASE_URL = 'https://media.cestovni-denik.cz'

type ImageVariantKind = MediaVariant['kind']

const PHOTO_ORDER: ImageVariantKind[] = ['thumb', 'small', 'medium', 'large']
// Videos show their poster; the mp4 variant is never usable as an image.
const VIDEO_ORDER: ImageVariantKind[] = ['poster', ...PHOTO_ORDER]

/** Picks the smallest suitable image variant, falling back to larger ones. */
export function pickThumbVariant(
  item: Pick<MediaItem, 'kind' | 'variants'>,
): MediaVariant | null {
  const order = item.kind === 'video' ? VIDEO_ORDER : PHOTO_ORDER
  for (const kind of order) {
    const found = item.variants.find((variant) => variant.kind === kind)
    if (found !== undefined) return found
  }
  return null
}

export function buildMediaUrl(
  storageKey: string,
  baseUrl: string = DEFAULT_MEDIA_BASE_URL,
): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/${storageKey.replace(/^\/+/, '')}`
}

export function getThumbUrl(
  item: Pick<MediaItem, 'kind' | 'variants'>,
  baseUrl: string = DEFAULT_MEDIA_BASE_URL,
): string | null {
  const variant = pickThumbVariant(item)
  return variant === null ? null : buildMediaUrl(variant.storageKey, baseUrl)
}
