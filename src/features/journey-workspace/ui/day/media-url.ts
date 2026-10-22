import type {
  MediaItem,
  MediaVariant,
} from '@/entities/media/model/media-library'
import { buildMediaUrl } from '@/features/journey-workspace/lib/media-thumb'

type Kind = MediaVariant['kind']

/** First available image variant in preference order (videos: poster first). */
export function variantUrl(
  item: Pick<MediaItem, 'kind' | 'variants'>,
  prefer: readonly Kind[],
  baseUrl: string,
): string | null {
  const order: Kind[] =
    item.kind === 'video' ? ['poster', ...prefer] : [...prefer]
  for (const kind of order) {
    const found = item.variants.find((variant) => variant.kind === kind)
    if (found !== undefined) return buildMediaUrl(found.storageKey, baseUrl)
  }
  return null
}

export const TILE_VARIANTS: readonly Kind[] = [
  'small',
  'thumb',
  'medium',
  'large',
]
export const HERO_VARIANTS: readonly Kind[] = [
  'medium',
  'large',
  'small',
  'thumb',
]
export const MAP_VARIANTS: readonly Kind[] = [
  'thumb',
  'small',
  'medium',
  'large',
]

/** Width / height of a media item, 4:3 when unknown, clamped to 0.5..2.2. */
export function aspectOf(item: Pick<MediaItem, 'height' | 'width'>): number {
  if (item.width === null || item.height === null) return 4 / 3
  return Math.min(2.2, Math.max(0.5, item.width / item.height))
}
