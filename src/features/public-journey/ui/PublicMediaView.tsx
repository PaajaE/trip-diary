import type { PublicMedia } from '@trip-diary/core/public-journey'
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
  /** Videos play inline (lightbox, moment); otherwise just the poster. */
  playable?: boolean
}

/** Image or video with intrinsic size so the layout never shifts. */
export function PublicMediaView({
  className,
  media,
  playable = false,
  priority = false,
  sizes,
}: PublicMediaViewProps) {
  const alt = media.caption ?? ''
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
  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      fetchPriority={priority ? 'high' : 'auto'}
      height={image.height}
      loading={priority ? 'eager' : 'lazy'}
      sizes={sizes}
      src={image.src}
      style={{
        objectPosition:
          media.focalX !== null && media.focalY !== null
            ? `${String(media.focalX * 100)}% ${String(media.focalY * 100)}%`
            : undefined,
      }}
      width={image.width}
      {...(image.srcSet !== '' ? { srcSet: image.srcSet } : {})}
    />
  )
}
