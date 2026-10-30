import { PHOTO_VARIANT_PREFERENCE } from '@trip-diary/utils'
import type {
  MediaItem,
  MediaVariant,
} from '@/entities/media/model/media-library'

export const DEFAULT_MEDIA_BASE_URL = 'https://media.cestovni-denik.cz'

type ImageVariantKind = MediaVariant['kind']

const PHOTO_ORDER: ImageVariantKind[] = ['thumb', 'small', 'medium', 'large']
// Videos show their poster; the mp4 variant is never usable as an image.
const VIDEO_ORDER: ImageVariantKind[] = ['poster', ...PHOTO_ORDER]

/**
 * The smallest image variant (`thumb`, ~220 px; falling back to larger ones).
 * Only for tiny strips and map markers: it is soft anywhere larger, where
 * <MediaImage> or getCardUrl is the way to show a photo.
 */
export function pickTinyThumbVariant(
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

export function getTinyThumbUrl(
  item: Pick<MediaItem, 'kind' | 'variants'>,
  baseUrl: string = DEFAULT_MEDIA_BASE_URL,
): string | null {
  const variant = pickTinyThumbVariant(item)
  return variant === null ? null : buildMediaUrl(variant.storageKey, baseUrl)
}

/**
 * Sources of a photo by their real widths (`thumb` ~220 px, `small` ~800 px,
 * `medium` ~1600 px): the browser chooses by the displayed size and the screen
 * density. `thumb` alone is only for tiny strips and is soft anywhere larger.
 * Without both widths it is the plain thumb. Videos stay on their poster.
 */
export function getSharpThumb(
  item: Pick<MediaItem, 'kind' | 'variants'>,
  baseUrl: string = DEFAULT_MEDIA_BASE_URL,
): { src: string; srcSet: string | null } | null {
  const plain = getTinyThumbUrl(item, baseUrl)
  if (plain === null || item.kind === 'video') {
    return plain === null ? null : { src: plain, srcSet: null }
  }
  const thumb = item.variants.find((variant) => variant.kind === 'thumb')
  const small = item.variants.find((variant) => variant.kind === 'small')
  const medium = item.variants.find((variant) => variant.kind === 'medium')
  if (thumb === undefined || small === undefined) {
    return { src: plain, srcSet: null }
  }
  return {
    src: buildMediaUrl(small.storageKey, baseUrl),
    srcSet: [thumb, small, ...(medium === undefined ? [] : [medium])]
      .map(
        (variant) =>
          `${buildMediaUrl(variant.storageKey, baseUrl)} ${String(variant.width)}w`,
      )
      .join(', '),
  }
}

const CARD_ORDER: ImageVariantKind[] = ['small', 'medium', 'thumb', 'large']

/**
 * One source for a large fixed area (a cover or CSS background) whose size is
 * not measured: `small` (~800 px), never the ~220 px thumb.
 */
export function getCardUrl(
  item: Pick<MediaItem, 'kind' | 'variants'>,
  baseUrl: string = DEFAULT_MEDIA_BASE_URL,
): string | null {
  const order: ImageVariantKind[] =
    item.kind === 'video' ? ['poster', ...CARD_ORDER] : CARD_ORDER
  for (const kind of order) {
    const found = item.variants.find((variant) => variant.kind === kind)
    if (found !== undefined) return buildMediaUrl(found.storageKey, baseUrl)
  }
  return null
}

const VIEWER_ORDER: ImageVariantKind[] = ['large', 'medium', 'small', 'thumb']

/** Largest available image variant (video: its poster first). */
export function pickViewerImageVariant(
  item: Pick<MediaItem, 'kind' | 'variants'>,
): MediaVariant | null {
  const order: ImageVariantKind[] =
    item.kind === 'video' ? ['poster', ...VIEWER_ORDER] : VIEWER_ORDER
  for (const kind of order) {
    const found = item.variants.find((variant) => variant.kind === kind)
    if (found !== undefined) return found
  }
  return null
}

/**
 * The largest image variant for zoom: the shared `zoom` preference chain
 * (`full` first, up to 2560 px; legacy `large` for rows without `full`).
 */
export function pickZoomImageVariant(
  item: Pick<MediaItem, 'kind' | 'variants'>,
): MediaVariant | null {
  if (item.kind === 'video') return pickViewerImageVariant(item)
  for (const kind of PHOTO_VARIANT_PREFERENCE.zoom) {
    const found = item.variants.find((variant) => variant.kind === kind)
    if (found !== undefined) return found
  }
  return null
}

/** URLs for the full-screen viewer: a large image/poster and, for videos, the mp4. */
export function getViewerUrls(
  item: Pick<MediaItem, 'kind' | 'variants'>,
  baseUrl: string = DEFAULT_MEDIA_BASE_URL,
): { imageUrl: string | null; videoUrl: string | null } {
  const image = pickViewerImageVariant(item)
  const video =
    item.kind === 'video'
      ? item.variants.find((variant) => variant.kind === 'video')
      : undefined
  return {
    imageUrl: image === null ? null : buildMediaUrl(image.storageKey, baseUrl),
    videoUrl:
      video === undefined ? null : buildMediaUrl(video.storageKey, baseUrl),
  }
}
