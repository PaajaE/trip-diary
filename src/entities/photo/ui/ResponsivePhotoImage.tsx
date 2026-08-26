import { useState, type ImgHTMLAttributes } from 'react'
import {
  buildResponsivePhotoSources,
  type PhotoSrcsetSource,
} from '@/entities/photo/lib/responsive-photo'
import { cn } from '@/shared/lib/cn'

export interface ResponsivePhotoImageProps
  extends Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    'src' | 'srcSet' | 'sizes' | 'width' | 'height'
  > {
  /** Fallback alt when decorative=false; decorative images use empty alt. */
  alt: string
  className?: string
  decorative?: boolean
  height?: number
  sizes?: string
  /** Primary URL (blob object URL or signed URL). */
  src: string
  /** Optional additional sources for srcset (signed URLs + widths). */
  srcSetSources?: readonly PhotoSrcsetSource[]
  width?: number
}

/**
 * Shared img wrapper for gallery grids / strips: lazy by default, optional
 * srcset from signed URLs, and width/height reservation to limit CLS.
 */
export function ResponsivePhotoImage({
  alt,
  className,
  decorative = true,
  height,
  loading = 'lazy',
  onError,
  sizes,
  src,
  srcSetSources,
  style,
  width,
  ...rest
}: ResponsivePhotoImageProps) {
  const [isBroken, setIsBroken] = useState(false)

  if (isBroken) {
    return null
  }

  const responsive =
    srcSetSources !== undefined && srcSetSources.length > 0
      ? (buildResponsivePhotoSources(srcSetSources, {
          ...(sizes === undefined ? {} : { sizes }),
        }) ?? { src })
      : { src, ...(sizes === undefined ? {} : { sizes }) }

  return (
    <img
      alt={decorative ? '' : alt}
      aria-hidden={decorative ? true : undefined}
      className={cn(className)}
      decoding="async"
      loading={loading}
      onError={(event) => {
        setIsBroken(true)
        onError?.(event)
      }}
      src={responsive.src}
      {...(style === undefined ? {} : { style })}
      {...(responsive.srcSet === undefined ? {} : { srcSet: responsive.srcSet })}
      {...(responsive.sizes === undefined ? {} : { sizes: responsive.sizes })}
      {...(typeof width === 'number' ? { width } : {})}
      {...(typeof height === 'number' ? { height } : {})}
      {...rest}
    />
  )
}
