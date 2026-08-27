import { Star } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoSrcsetSource } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { MOMENT_COVER_SIZES } from '@/features/journeys/ui/moment-editorial-layout'
import { cn } from '@/shared/lib/cn'

const COVER_IMAGE_CLASS =
  'aspect-[16/10] max-h-[min(58svh,34rem)] w-full object-cover transition duration-500 group-hover:scale-[1.01]'

interface MomentCoverHeroProps {
  alt: string
  className?: string
  fetchPriority?: 'high' | 'low' | 'auto'
  focalStyle?: CSSProperties
  loading?: 'eager' | 'lazy'
  mediaType?: 'photo' | 'video'
  onClick: () => void
  showCoverBadge?: boolean
  src: string
  srcSetSources?: readonly PhotoSrcsetSource[]
}

export function MomentCoverHero({
  alt,
  className,
  fetchPriority = 'high',
  focalStyle,
  loading = 'eager',
  mediaType,
  onClick,
  showCoverBadge = false,
  src,
  srcSetSources,
}: MomentCoverHeroProps) {
  const { t } = useTranslation()

  return (
    <button
      aria-label={alt}
      className={cn(
        'group relative block w-full overflow-hidden rounded-2xl focus-visible:outline-offset-2 sm:rounded-[1.25rem]',
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <ResponsivePhotoImage
        alt={alt}
        className={COVER_IMAGE_CLASS}
        decorative={false}
        fetchPriority={fetchPriority}
        loading={loading}
        sizes={MOMENT_COVER_SIZES}
        src={src}
        {...(srcSetSources === undefined || srcSetSources.length === 0
          ? {}
          : { srcSetSources })}
        {...(focalStyle === undefined ? {} : { style: focalStyle })}
      />
      {mediaType === 'video' ? <VideoPlayOverlay /> : null}
      {showCoverBadge ? (
        <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/95">
          <Star aria-hidden="true" className="size-3 fill-current" />
          {t('entry.coverPhoto')}
        </span>
      ) : null}
    </button>
  )
}
