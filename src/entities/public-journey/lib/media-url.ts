import type {
  PublicMedia,
  PublicMediaVariant,
} from '@trip-diary/core/public-journey'
import { publicEnv } from '@/shared/config/env'

const DEFAULT_MEDIA_BASE_URL = 'https://media.cestovni-denik.cz'

/** Public URL of an R2 object behind the media (CDN) domain. */
export function publicMediaUrl(
  storageKey: string,
  baseUrl: string = publicEnv.mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL,
): string {
  return `${baseUrl.replace(/\/+$/, '')}/${storageKey.replace(/^\/+/, '')}`
}

const IMAGE_KINDS = ['thumb', 'small', 'medium', 'large'] as const

function imageVariants(variants: PublicMediaVariant[]): PublicMediaVariant[] {
  return variants
    .filter((v) => (IMAGE_KINDS as readonly string[]).includes(v.kind))
    .sort((a, b) => a.width - b.width)
}

/** `srcset` from thumb/small/medium/large with real width descriptors. */
export function buildSrcSet(
  variants: PublicMediaVariant[],
  baseUrl?: string,
): string {
  const seen = new Set<number>()
  const parts: string[] = []
  for (const variant of imageVariants(variants)) {
    if (seen.has(variant.width)) continue
    seen.add(variant.width)
    parts.push(
      `${publicMediaUrl(variant.storageKey, baseUrl)} ${String(variant.width)}w`,
    )
  }
  return parts.join(', ')
}

export interface ResolvedImage {
  height: number
  src: string
  srcSet: string
  width: number
}

/** True when resolveImage() would find something; skips building srcset. */
export function hasImage(
  media: Pick<PublicMedia, 'kind' | 'variants'>,
): boolean {
  const wanted: readonly string[] =
    media.kind === 'video' ? ['poster'] : IMAGE_KINDS
  return media.variants.some((v) => wanted.includes(v.kind))
}

/** Image source for a photo, or the poster for a video. Null without variants. */
export function resolveImage(
  media: Pick<PublicMedia, 'kind' | 'variants'>,
  baseUrl?: string,
): ResolvedImage | null {
  if (media.kind === 'video') {
    const poster = media.variants.find((v) => v.kind === 'poster')
    return poster === undefined
      ? null
      : {
          height: poster.height,
          src: publicMediaUrl(poster.storageKey, baseUrl),
          srcSet: '',
          width: poster.width,
        }
  }
  const sorted = imageVariants(media.variants)
  const fallback =
    sorted.find((v) => v.kind === 'medium') ?? sorted[sorted.length - 1]
  if (fallback === undefined) return null
  return {
    height: fallback.height,
    src: publicMediaUrl(fallback.storageKey, baseUrl),
    srcSet: buildSrcSet(media.variants, baseUrl),
    width: fallback.width,
  }
}

export interface ResolvedVideo {
  height: number
  poster: string | null
  src: string
  width: number
}

export function resolveVideo(
  media: Pick<PublicMedia, 'variants'>,
  baseUrl?: string,
): ResolvedVideo | null {
  const mp4 = media.variants.find((v) => v.kind === 'video')
  if (mp4 === undefined) return null
  const poster = media.variants.find((v) => v.kind === 'poster')
  return {
    height: mp4.height,
    poster:
      poster === undefined ? null : publicMediaUrl(poster.storageKey, baseUrl),
    src: publicMediaUrl(mp4.storageKey, baseUrl),
    width: mp4.width,
  }
}

/** Smallest thumbnail URL (map pins, cards). */
export function resolveThumbUrl(
  media: Pick<PublicMedia, 'kind' | 'variants'>,
  baseUrl?: string,
): string | null {
  if (media.kind === 'video') {
    const poster = media.variants.find((v) => v.kind === 'poster')
    if (poster !== undefined) return publicMediaUrl(poster.storageKey, baseUrl)
  }
  const first = imageVariants(media.variants)[0]
  return first === undefined ? null : publicMediaUrl(first.storageKey, baseUrl)
}
