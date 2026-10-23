import { Link } from '@tanstack/react-router'
import type { PublicMedia } from '@trip-diary/core/public-journey'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DayMosaic } from '@/features/public-journey/ui/DayMosaic'
import { StageBadge } from '@/features/public-journey/ui/StageBadge'
import { cn } from '@/shared/lib/cn'

interface StageCardProps {
  badge: string
  body: string
  color: string
  counts: string
  /** Big variant: mosaic left, text right from `md` up. */
  featured: boolean
  journeySlug: string
  media: readonly PublicMedia[]
  mediaTotal: number
  range: string
  segmentId: string
  spaceHandle: string
  title: string
}

/** Stage as a card: coloured badge, 2/1/1 mosaic, title, numbers, first lines. */
export function StageCard({
  badge,
  body,
  color,
  counts,
  featured,
  journeySlug,
  media,
  mediaTotal,
  range,
  segmentId,
  spaceHandle,
  title,
}: StageCardProps) {
  const { t } = useTranslation()
  return (
    <Link
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-[14px] border border-border bg-surface transition-shadow hover:shadow-soft motion-reduce:transition-none',
        featured && 'md:grid md:grid-cols-[3fr_2fr]',
      )}
      params={{ journeySlug, segmentId, spaceHandle }}
      to="/$spaceHandle/$journeySlug/e/$segmentId"
    >
      <span className="relative block">
        <DayMosaic
          className={
            featured
              ? 'aspect-[4/3] sm:aspect-[16/10] md:h-full md:aspect-auto md:min-h-72'
              : 'aspect-[4/3] sm:aspect-[16/10]'
          }
          media={media}
          sizes={
            featured
              ? '(min-width: 768px) 60vw, 100vw'
              : '(min-width: 640px) 50vw, 100vw'
          }
          total={mediaTotal}
        />
        <StageBadge
          className="absolute top-3 left-3"
          color={color}
          label={badge}
        />
      </span>
      <span className="flex flex-1 flex-col justify-center gap-1.5 p-5">
        <span className="text-xs text-muted">{range}</span>
        <span className="reader-display text-2xl leading-tight md:text-3xl">
          {title}
        </span>
        <span className="text-xs text-muted">{counts}</span>
        {body === '' ? null : (
          <span className="mt-1 line-clamp-3 text-sm leading-6">{body}</span>
        )}
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          {t('publicJourney.readStage')}
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </span>
    </Link>
  )
}
