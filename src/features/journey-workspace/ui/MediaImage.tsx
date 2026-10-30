import { useLayoutEffect, useRef, useState } from 'react'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  getSharpThumb,
  getTinyThumbUrl,
} from '@/features/journey-workspace/lib/media-thumb'

interface MediaImageProps {
  alt?: string
  baseUrl: string
  className?: string
  item: Pick<MediaItem, 'kind' | 'variants'>
  loading?: 'eager' | 'lazy'
  testId?: string
}

/**
 * A photo (or video poster) that is always sharp: it measures the box it is
 * drawn in and offers the browser every variant by its real width
 * (`srcset` + `sizes` = the measured width), so a 2x screen gets `small`
 * where a 1x one gets `thumb`. The one way to show a media image in a grid,
 * card or sheet: picking a single variant by hand (getTinyThumbUrl) is what made
 * big cells blurry. The source is set after the first layout, so a cell never
 * downloads the wrong size first.
 */
export function MediaImage({
  alt = '',
  baseUrl,
  className,
  item,
  loading = 'lazy',
  testId,
}: MediaImageProps) {
  const ref = useRef<HTMLImageElement>(null)
  // null: not measured yet (no source); 0: no layout (tests, hidden) -> thumb.
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return undefined
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width)
      // Only ever grows: a resize to a smaller box keeps the sharp source.
      setWidth((current) => Math.max(current ?? 0, next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])

  if (getTinyThumbUrl(item, baseUrl) === null) return null
  const sharp =
    width === null || width === 0 ? null : getSharpThumb(item, baseUrl)
  const src =
    width === null ? undefined : (sharp?.src ?? getTinyThumbUrl(item, baseUrl))
  return (
    <img
      alt={alt}
      className={className}
      data-testid={testId}
      decoding="async"
      loading={loading}
      ref={ref}
      sizes={sharp?.srcSet == null ? undefined : `${String(width)}px`}
      src={src ?? undefined}
      srcSet={sharp?.srcSet ?? undefined}
    />
  )
}
