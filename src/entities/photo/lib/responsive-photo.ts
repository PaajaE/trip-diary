import { PHOTO_SRCSET_WIDTHS, type CanonicalPhotoVariant } from '@trip-diary/utils'

export interface PhotoSrcsetSource {
  url: string
  /** Intrinsic / declared width in CSS pixels (longest-edge target). */
  width: number
}

export interface ResponsivePhotoSources {
  sizes?: string
  src: string
  srcSet?: string
}

/** Build a `src` / `srcSet` pair from available signed (or blob) URLs. */
export function buildResponsivePhotoSources(
  sources: readonly PhotoSrcsetSource[],
  options?: { sizes?: string },
): ResponsivePhotoSources | null {
  const usable = sources
    .filter((source) => source.url.trim().length > 0 && source.width > 0)
    .slice()
    .sort((left, right) => left.width - right.width)

  const preferred = usable[0]
  if (preferred === undefined) {
    return null
  }

  if (usable.length === 1) {
    return {
      src: preferred.url,
      ...(options?.sizes === undefined ? {} : { sizes: options.sizes }),
    }
  }

  return {
    src: preferred.url,
    srcSet: usable
      .map((source) => `${source.url} ${String(source.width)}w`)
      .join(', '),
    ...(options?.sizes === undefined ? {} : { sizes: options.sizes }),
  }
}

/**
 * Map known variant kinds to canonical srcset widths when signed URLs are
 * available for multiple variants. Legacy `preview`/`large` ≡ full.
 */
export function buildSrcsetFromVariantUrls(
  urlsByVariant: Partial<
    Record<CanonicalPhotoVariant | 'preview' | 'large', string>
  >,
  options?: { sizes?: string },
): ResponsivePhotoSources | null {
  const sources: PhotoSrcsetSource[] = []
  for (const entry of PHOTO_SRCSET_WIDTHS) {
    let url = urlsByVariant[entry.variant]
    if (
      entry.variant === 'full' &&
      (url === undefined || url.trim().length === 0)
    ) {
      url = urlsByVariant.preview ?? urlsByVariant.large
    }
    if (url !== undefined && url.trim().length > 0) {
      sources.push({ url, width: entry.width })
    }
  }
  return buildResponsivePhotoSources(sources, options)
}

export const GALLERY_GRID_SIZES =
  '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px'

export const READER_STRIP_SIZES = '72px'
