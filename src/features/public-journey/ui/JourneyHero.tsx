import { Link } from '@tanstack/react-router'
import type { PublicMedia } from '@trip-diary/core/public-journey'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'
import { StatRow, type Stat } from '@/features/public-journey/ui/StatRow'
import { cn } from '@/shared/lib/cn'

interface JourneyHeroProps {
  cover: PublicMedia | null
  eyebrow: string
  mirror: { from: string; to: string } | undefined
  period: string | null
  /** First chapter the "Start reading" button opens, if any. */
  start: { journeySlug: string; segmentId: string; spaceHandle: string } | null
  stats: readonly Stat[]
  title: string
}

const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold'

/**
 * Full-width cover with title, dates and numbers. The box has a reserved
 * height (no layout shift); the photo is cropped to it, never stretched.
 * Mirrors the static shell in scripts/lib/prerender.mjs (keep in sync).
 */
export function JourneyHero({
  cover,
  eyebrow,
  mirror,
  period,
  start,
  stats,
  title,
}: JourneyHeroProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const share = () => {
    const url = window.location.href
    if (typeof navigator.share === 'function') {
      void navigator.share({ title, url }).catch(() => undefined)
      return
    }
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 2000)
    })
  }
  return (
    <header className="relative isolate flex h-[clamp(22rem,46vw,36rem)] items-end overflow-hidden bg-primary text-white">
      {cover === null ? null : (
        <PublicMediaView
          className="absolute inset-0 -z-10 h-full w-full object-cover"
          media={cover}
          mirror={mirror}
          priority
          sizes="100vw"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      <div className="mx-auto w-full max-w-6xl space-y-3 px-5 pb-8 sm:pb-10">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-white/85">
          {eyebrow}
        </p>
        <h1 className="reader-display text-4xl leading-[1.05] sm:text-6xl">
          {title}
        </h1>
        {period === null ? null : (
          <p className="text-sm text-white/90">{period}</p>
        )}
        <StatRow stats={stats} tone="light" />
        <div className="flex flex-wrap gap-2 pt-1">
          {start === null ? null : (
            <Link
              className={cn(BUTTON, 'bg-primary text-primary-foreground')}
              params={start}
              to="/$spaceHandle/$journeySlug/e/$segmentId"
            >
              {t('publicJourney.startReading')}
            </Link>
          )}
          <button
            className={cn(
              BUTTON,
              'border border-white/50 bg-white/10 text-white',
            )}
            type="button"
            onClick={share}
          >
            {copied ? t('publicJourney.shareCopied') : t('publicJourney.share')}
          </button>
        </div>
      </div>
    </header>
  )
}
