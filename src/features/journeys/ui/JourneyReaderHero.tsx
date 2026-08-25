import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scrollToReaderSection } from '@/features/journeys/lib/journey-reader-section'
import { JourneyStatsBar } from '@/features/journeys/ui/JourneyStatsBar'
import { buttonVariants } from '@/shared/ui/button-variants'
import { cn } from '@/shared/lib/cn'

interface JourneyReaderHeroProps {
  coverUrl?: string
  dayCount?: number | null
  mapPointCount: number
  momentCount: number
  photoCount: number
  summary: string
  title: string
}

export function JourneyReaderHero({
  coverUrl,
  dayCount = null,
  mapPointCount,
  momentCount,
  photoCount,
  summary,
  title,
}: JourneyReaderHeroProps) {
  const { t } = useTranslation()
  const showCover = coverUrl !== undefined && coverUrl !== ''

  return (
    <>
      <header className="reader-hero relative isolate z-[2] min-h-[min(48svh,22rem)] overflow-hidden sm:min-h-[min(58svh,34rem)]">
        <div
          className="reader-hero-fallback absolute inset-0"
          aria-hidden="true"
        />

        {showCover ? (
          <JourneyReaderCoverImage key={coverUrl} coverUrl={coverUrl} />
        ) : null}

        <div className="relative flex min-h-[min(48svh,22rem)] flex-col justify-end px-5 pb-7 pt-20 sm:min-h-[min(58svh,34rem)] sm:px-8 sm:pb-10 sm:pt-24">
          <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
            <h1 className="reader-display reader-hero-title max-w-4xl text-[clamp(2.05rem,7vw,3.75rem)] leading-[0.98] tracking-[-0.04em]">
              {title}
            </h1>
            {summary === '' ? null : (
              <p className="reader-hero-meta mt-4 max-w-2xl text-base leading-7 sm:text-lg">
                {summary}
              </p>
            )}
            <button
              className={cn(
                buttonVariants({ variant: 'primary' }),
                'reader-hero-cta mt-7 w-fit',
              )}
              onClick={() => {
                scrollToReaderSection('story')
              }}
              type="button"
            >
              {t('reader.exploreJourney')}
            </button>
          </div>
        </div>
      </header>
      <div className="reader-stats-bar">
        <JourneyStatsBar
          className="mx-auto w-full max-w-3xl px-5 sm:px-8 lg:max-w-4xl"
          {...(dayCount === null ? {} : { dayCount })}
          mapPointCount={mapPointCount}
          momentCount={momentCount}
          photoCount={photoCount}
        />
      </div>
    </>
  )
}

function JourneyReaderCoverImage({ coverUrl }: { coverUrl: string }) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [coverReady, setCoverReady] = useState(false)

  if (coverFailed) {
    return null
  }

  return (
    <>
      <img
        alt=""
        aria-hidden="true"
        className={`reader-hero-cover absolute inset-0 size-full object-cover object-[center_38%] transition-opacity duration-700 ${
          coverReady ? 'opacity-100' : 'opacity-0'
        }`}
        decoding="async"
        fetchPriority="high"
        onError={() => {
          setCoverFailed(true)
        }}
        onLoad={() => {
          setCoverReady(true)
        }}
        src={coverUrl}
      />
      <div className="reader-hero-overlay absolute inset-0" />
    </>
  )
}
