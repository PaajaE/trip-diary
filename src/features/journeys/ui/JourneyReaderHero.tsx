import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scrollToReaderSection } from '@/features/journeys/lib/journey-reader-section'
import { TripSummaryLine } from '@/features/journeys/ui/TripSummaryLine'

interface JourneyReaderHeroProps {
  coverUrl?: string
  dateLabel: string
  mapPointCount: number
  momentCount: number
  photoCount: number
  spaceHandle: string
  summary: string
  title: string
}

export function JourneyReaderHero({
  coverUrl,
  dateLabel,
  mapPointCount,
  momentCount,
  photoCount,
  spaceHandle,
  summary,
  title,
}: JourneyReaderHeroProps) {
  const { t } = useTranslation()
  const showCover = coverUrl !== undefined && coverUrl !== ''

  return (
    <header className="reader-hero relative isolate z-[2] min-h-[88svh] overflow-hidden">
      <div
        className="reader-hero-fallback absolute inset-0"
        aria-hidden="true"
      />

      {showCover ? (
        <JourneyReaderCoverImage key={coverUrl} coverUrl={coverUrl} />
      ) : null}

      <div className="relative flex min-h-[88svh] flex-col justify-end px-5 pb-10 pt-28 sm:px-8 sm:pb-14">
        <div className="mx-auto w-full max-w-3xl">
          <Link
            className="reader-hero-meta inline-flex min-h-11 items-center rounded-full bg-white/12 px-4 py-2 text-sm font-semibold backdrop-blur-md transition hover:bg-white/20"
            params={{ spaceHandle }}
            to="/$spaceHandle"
          >
            @{spaceHandle}
          </Link>
          <p className="reader-hero-meta mt-5 text-sm font-medium tracking-[0.18em] uppercase">
            {dateLabel}
          </p>
          <h1 className="reader-display reader-hero-title mt-4 max-w-4xl text-[clamp(2.5rem,8vw,4.75rem)] leading-[0.95] tracking-[-0.04em]">
            {title}
          </h1>
          {summary === '' ? null : (
            <p className="reader-hero-meta mt-5 max-w-2xl text-base leading-8 sm:text-lg">
              {summary}
            </p>
          )}
          <div className="reader-hero-meta mt-6 [&_p]:text-white/80">
            <TripSummaryLine
              mapPointCount={mapPointCount}
              momentCount={momentCount}
              photoCount={photoCount}
            />
          </div>
        </div>

        <button
          aria-label={t('reader.scrollToStory')}
          className="reader-hero-meta mx-auto mt-10 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur-md transition hover:bg-white/20"
          onClick={() => {
            scrollToReaderSection('story')
          }}
          type="button"
        >
          <ChevronDown
            aria-hidden="true"
            className="animate-bounce"
            size={22}
          />
        </button>
      </div>
    </header>
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
        className={`reader-hero-cover absolute inset-0 size-full object-cover transition-opacity duration-700 ${
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
