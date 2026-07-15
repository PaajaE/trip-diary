import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scrollToReaderSection } from '@/features/journeys/lib/journey-reader-section'
import { TripSummaryLine } from '@/features/journeys/ui/TripSummaryLine'

interface JourneyReaderHeroProps {
  coverUrl?: string
  mapPointCount: number
  momentCount: number
  photoCount: number
  spaceHandle: string
  summary: string
  title: string
}

export function JourneyReaderHero({
  coverUrl,
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
    <header className="reader-hero relative isolate z-[2] min-h-[min(68svh,40rem)] overflow-hidden">
      <div
        className="reader-hero-fallback absolute inset-0"
        aria-hidden="true"
      />

      {showCover ? (
        <JourneyReaderCoverImage key={coverUrl} coverUrl={coverUrl} />
      ) : null}

      <div className="relative flex min-h-[min(68svh,40rem)] flex-col justify-end px-5 pb-8 pt-24 sm:px-8 sm:pb-10">
        <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
          <Link
            className="reader-hero-meta inline-flex min-h-11 items-center rounded-full bg-white/12 px-4 py-2 text-sm font-semibold backdrop-blur-md transition hover:bg-white/20"
            params={{ spaceHandle }}
            to="/$spaceHandle"
          >
            @{spaceHandle}
          </Link>
          <h1 className="reader-display reader-hero-title mt-5 max-w-4xl text-[clamp(2.25rem,7vw,4.25rem)] leading-[0.98] tracking-[-0.04em]">
            {title}
          </h1>
          {summary === '' ? null : (
            <p className="reader-hero-meta mt-4 max-w-2xl text-base leading-7 sm:text-lg">
              {summary}
            </p>
          )}
          <div className="reader-hero-meta mt-5 [&_p]:text-white/80">
            <TripSummaryLine
              mapPointCount={mapPointCount}
              momentCount={momentCount}
              photoCount={photoCount}
            />
          </div>
        </div>

        <button
          aria-label={t('reader.scrollToTripStages')}
          className="reader-hero-meta reader-hero-scroll mx-auto mt-8 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur-md transition hover:bg-white/20"
          onClick={() => {
            scrollToReaderSection('story')
          }}
          type="button"
        >
          <ChevronDown
            aria-hidden="true"
            className="reader-hero-scroll__icon"
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
        className={`reader-hero-cover absolute inset-0 size-full object-cover object-center transition-opacity duration-700 ${
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
