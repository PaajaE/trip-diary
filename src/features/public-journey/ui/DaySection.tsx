import { Link } from '@tanstack/react-router'
import type { PublicMedia } from '@trip-diary/core/public-journey'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DayMosaic } from '@/features/public-journey/ui/DayMosaic'
import { StopRow } from '@/features/public-journey/ui/StopRow'
import { cn } from '@/shared/lib/cn'
import { stageTextColor } from '@/shared/lib/stage-palette'

export interface DayStop {
  excerpt: string
  id: string
  thumb: PublicMedia | null
  time: string
  title: string
}

export interface DayTripCard {
  detail: string
  id: string
  kind: string
  title: string
}

interface DaySectionProps {
  /** The day's pins are lit on the map (hover here or on a pin). */
  active: boolean
  onActive: (active: boolean) => void
  color: string
  heading: string
  id: string
  journeySlug: string
  /** All photos of the day, in lightbox order (the first three form the mosaic). */
  media: readonly PublicMedia[]
  /** The day note (author's text), paragraphs separated by blank lines. */
  note: string | null
  number: number
  onOpenMedia: (index: number) => void
  places: readonly string[]
  spaceHandle: string
  stops: readonly DayStop[]
  trips: readonly DayTripCard[]
  /** Below the fold: painted lazily (`content-visibility`). */
  lazy: boolean
  /**
   * A day without the author's words folds into one line (date, counts) that
   * opens on tap. Native `<details>`, so it works without JavaScript and
   * closed photos are not fetched.
   */
  collapsed?: boolean
}

/** One day of a stage: the unit of reading. */
export function DaySection({
  active,
  collapsed = false,
  onActive,
  color,
  heading,
  id,
  journeySlug,
  lazy,
  media,
  note,
  number,
  onOpenMedia,
  places,
  spaceHandle,
  stops,
  trips,
}: DaySectionProps) {
  const { t } = useTranslation()
  const paragraphs =
    note === null
      ? []
      : note
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter((p) => p !== '')
  const pointerHandlers = {
    onBlur: () => {
      onActive(false)
    },
    onFocus: () => {
      onActive(true)
    },
    onPointerEnter: () => {
      onActive(true)
    },
    onPointerLeave: () => {
      onActive(false)
    },
  }
  const headingNode = (
    <h2
      className="reader-display text-2xl"
      id={`${id}-title`}
      style={active ? { color: stageTextColor(color) } : undefined}
    >
      {heading}
    </h2>
  )
  const placesNode =
    places.length > 0 ? (
      <p className="flex flex-wrap gap-x-3 text-sm text-muted">
        {places.map((place) => (
          <span className="inline-flex items-center gap-1.5" key={place}>
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {place}
          </span>
        ))}
      </p>
    ) : null
  const content = (
    <>
      {media.length > 0 ? (
        <DayMosaic
          className="aspect-[4/3] rounded-xl sm:aspect-[16/10]"
          media={media}
          sizes="(min-width: 1000px) 40rem, 100vw"
          total={media.length}
          onOpen={onOpenMedia}
        />
      ) : null}
      {paragraphs.length > 0 ? (
        <div className="reader-body max-w-[65ch] space-y-3 text-lg leading-8">
          {paragraphs.map((paragraph, index) => (
            <p
              className={
                index === 0
                  ? 'whitespace-pre-line first-letter:float-left first-letter:pr-2 first-letter:text-5xl first-letter:leading-[0.9] first-letter:font-semibold'
                  : 'whitespace-pre-line'
              }
              key={paragraph}
            >
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}
      {trips.map((trip) => (
        <Link
          className="block rounded-xl bg-primary-soft p-4 hover:bg-primary-soft/70"
          key={trip.id}
          params={{ journeySlug, segmentId: trip.id, spaceHandle }}
          to="/$spaceHandle/$journeySlug/e/$segmentId"
        >
          <span className="block text-[11px] font-semibold tracking-[0.12em] uppercase text-primary">
            {trip.kind}
          </span>
          <span className="reader-display block text-lg">{trip.title}</span>
          {trip.detail === '' ? null : (
            <span className="block text-sm text-muted">{trip.detail}</span>
          )}
        </Link>
      ))}
      {stops.length > 0 ? (
        <ul aria-label={t('publicJourney.dayStops')} className="space-y-1.5">
          {stops.map((stop) => (
            <li key={stop.id}>
              <StopRow
                excerpt={stop.excerpt}
                journeySlug={journeySlug}
                momentId={stop.id}
                spaceHandle={spaceHandle}
                thumb={stop.thumb}
                time={stop.time}
                title={stop.title}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )

  if (collapsed) {
    const counts = [
      media.length > 0
        ? t('publicJourney.mediaCount', { count: media.length })
        : null,
      stops.length > 0
        ? t('publicJourney.stopsCount', { count: stops.length })
        : null,
    ]
      .filter((part) => part !== null)
      .join(' · ')
    return (
      <details
        className="group scroll-mt-[calc(var(--reader-bar-h)+3.5rem)] border-t border-border pt-2 first:border-t-0 first:pt-0"
        data-day={id}
        id={id}
        {...pointerHandlers}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-1 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="flex items-baseline gap-3">
              {headingNode}
              <span className="text-xs tabular-nums text-faint">
                {t('workspace.dayNumber', { n: number })}
              </span>
            </span>
            <span className="text-sm text-muted">
              {counts}
              <span className="sr-only"> · {t('publicJourney.dayExpand')}</span>
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="space-y-4 pt-3">
          {placesNode}
          {content}
        </div>
      </details>
    )
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        'scroll-mt-[calc(var(--reader-bar-h)+3.5rem)] space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0',
        lazy && '[contain-intrinsic-size:auto_52rem] [content-visibility:auto]',
      )}
      data-day={id}
      id={id}
      {...pointerHandlers}
    >
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          {headingNode}
          <span className="text-xs tabular-nums text-faint">
            {t('workspace.dayNumber', { n: number })}
          </span>
        </div>
        {placesNode}
      </header>
      {content}
    </section>
  )
}
