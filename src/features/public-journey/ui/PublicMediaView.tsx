import type { PublicMedia } from '@trip-diary/core/public-journey'
import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import {
  resolveImage,
  resolveVideo,
} from '@/entities/public-journey/lib/media-url'

interface PublicMediaViewProps {
  className?: string
  /** Hero image only: eager load + high fetch priority. */
  priority?: boolean
  sizes: string
  media: PublicMedia
  /**
   * Same-origin copy of one variant (prerendered hero): swapped into the
   * URLs so the browser reuses the image the static shell already loaded.
   */
  mirror?: { from: string; to: string } | undefined
  /** Videos play inline (lightbox, moment); otherwise just the poster. */
  playable?: boolean
}

/** Image or video with intrinsic size so the layout never shifts. */
export function PublicMediaView({
  className,
  media,
  mirror,
  playable = false,
  priority = false,
  sizes,
}: PublicMediaViewProps) {
  const alt = media.caption ?? ''
  // Lazy images fade in once loaded (no hard pop on the tile colour); the
  // hero and an image that is already complete (cache) show at once.
  const [loaded, setLoaded] = useState(false)
  if (media.kind === 'video' && playable) {
    const video = resolveVideo(media)
    if (video !== null) {
      return (
        // Public photo/video clips carry no speech track; captions do not apply.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          className={className}
          controls
          height={video.height}
          playsInline
          poster={video.poster ?? undefined}
          preload="none"
          width={video.width}
        >
          <source src={video.src} type="video/mp4" />
        </video>
      )
    }
  }
  const image = resolveImage(media)
  if (image === null) {
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{ aspectRatio: '4 / 3' }}
      />
    )
  }
  const swap = (value: string) =>
    mirror === undefined ? value : value.split(mirror.from).join(mirror.to)
  return (
    <img
      alt={alt}
      className={cn(
        className,
        !priority &&
          'transition-opacity duration-300 motion-reduce:transition-none',
        !priority && !loaded && 'opacity-0',
      )}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      height={image.height}
      loading={priority ? 'eager' : 'lazy'}
      ref={(element) => {
        if (element?.complete === true && element.naturalWidth > 0) {
          setLoaded(true)
        }
      }}
      onError={() => {
        setLoaded(true)
      }}
      onLoad={() => {
        setLoaded(true)
      }}
      sizes={sizes}
      src={swap(image.src)}
      style={{
        objectPosition:
          media.focalX !== null && media.focalY !== null
            ? `${String(media.focalX * 100)}% ${String(media.focalY * 100)}%`
            : undefined,
      }}
      width={image.width}
      {...(image.srcSet !== '' ? { srcSet: swap(image.srcSet) } : {})}
    />
  )
}
