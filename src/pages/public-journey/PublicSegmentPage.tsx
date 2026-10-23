import { Link, useNavigate } from '@tanstack/react-router'
import type {
  PublicJourney,
  PublicMedia,
  PublicMoment,
  PublicSegment,
} from '@trip-diary/core/public-journey'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildJourneyModel,
  formatInZone,
  type JourneyDay,
  type JourneyModel,
  pickCover,
  zoneOf,
} from '@/entities/public-journey/lib/journey-model'
import { resolveImage } from '@/entities/public-journey/lib/media-url'
import { TargetEngagement } from '@/features/public-engagement/ui/CommentsSection'
import { buildMapData } from '@/features/public-journey/lib/build-map-data'
import {
  excerpt,
  formatDateRange,
  formatDistance,
} from '@/features/public-journey/lib/format'
import {
  firstSentence,
  publicMomentTitle,
} from '@/features/public-journey/lib/moment-title'
import { pickMosaicMedia } from '@/features/public-journey/lib/mosaic-media'
import { Crumbs } from '@/features/public-journey/ui/Crumbs'
import { DayRail } from '@/features/public-journey/ui/DayRail'
import {
  DaySection,
  type DayStop,
  type DayTripCard,
} from '@/features/public-journey/ui/DaySection'
import { PublicMapSection } from '@/features/public-journey/ui/LazyPublicJourneyMap'
import {
  MediaGallery,
  MediaLightbox,
} from '@/features/public-journey/ui/MediaGallery'
import { StageBadge } from '@/features/public-journey/ui/StageBadge'
import { StageStrip } from '@/features/public-journey/ui/StageStrip'
import { StatRow } from '@/features/public-journey/ui/StatRow'
import { PublicRouteNotFound } from '@/pages/public-space/PublicRouteMessage'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'

interface Props {
  data: PublicJourney
  journeySlug: string
  segmentId: string
  spaceHandle: string
}

/** Etapa (stage) or Výlet (trip): both share this layout. */
export function PublicSegmentPage(props: Props) {
  const { data, journeySlug, segmentId, spaceHandle } = props
  const model = useMemo(() => buildJourneyModel(data), [data])
  const segment = model.segmentById.get(segmentId)
  if (segment === undefined) {
    return <PublicRouteNotFound labelKey="publicJourney.segmentNotFound" />
  }
  return (
    <SegmentView
      journeySlug={journeySlug}
      model={model}
      segment={segment}
      spaceHandle={spaceHandle}
    />
  )
}

interface ViewProps {
  journeySlug: string
  model: JourneyModel
  segment: PublicSegment
  spaceHandle: string
}

/** "Úterý 22. 7." for a day key (a calendar date, so no zone is involved). */
function dayHeading(key: string, locale: string, weekday: 'long' | 'short') {
  const text = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
    weekday,
  }).format(new Date(`${key}T12:00:00Z`))
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

function SegmentView({ journeySlug, model, segment, spaceHandle }: ViewProps) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const locale = i18n.language
  const isStage = segment.kind === 'stage'
  const stage = model.stageOf(segment.id)
  const stageIndex = isStage
    ? model.stages.findIndex((s) => s.id === segment.id)
    : -1
  const color = model.stageColor(segment.id)
  const map = useMemo(
    () => buildMapData(model, segment.id),
    [model, segment.id],
  )
  const spanMedia = model.mediaInSpan(segment.id)
  const cover = pickCover(model, segment.coverMediaId, spanMedia)
  const coverImage = cover === null ? null : resolveImage(cover)
  const zone = zoneOf(model, segment)
  const days = useMemo(() => model.daysOfStage(segment.id), [model, segment.id])
  const tracks = model.data.tracks.filter((track) => {
    const owner = model.segmentById.get(track.segmentId)
    return (
      track.segmentId === segment.id ||
      (owner !== undefined &&
        Date.parse(segment.startsAt) <= Date.parse(owner.startsAt) &&
        Date.parse(owner.endsAt) <= Date.parse(segment.endsAt))
    )
  })
  const distance = tracks.reduce((sum, tr) => sum + (tr.distanceM ?? 0), 0)
  const ascent = tracks.reduce((sum, tr) => sum + (tr.ascentM ?? 0), 0)
  const stopCount = model.momentsInSpan(segment.id).length
  useDocumentMeta({
    ...(segment.body !== '' ? { description: excerpt(segment.body) } : {}),
    ...(coverImage !== null ? { imageUrl: coverImage.src } : {}),
    title: `${segment.title} · ${model.data.journey.title}`,
  })

  // Day under the pointer (day section or map pin): its pins stay lit.
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const highlight = useMemo(
    () => (activeDay === null ? null : { dayKey: activeDay, stageId: null }),
    [activeDay],
  )
  const [lightbox, setLightbox] = useState<{
    index: number
    items: readonly PublicMedia[]
  } | null>(null)
  const closeLightbox = useCallback(() => {
    setLightbox(null)
  }, [])
  const moveLightbox = useCallback((index: number) => {
    setLightbox((current) => (current === null ? null : { ...current, index }))
  }, [])

  const stageTrips = useMemo(
    () => (isStage ? model.tripsOfStage(segment.id) : []),
    [isStage, model, segment.id],
  )
  const tripCard = (trip: PublicSegment): DayTripCard => {
    const own = model.data.tracks.filter((tr) => tr.segmentId === trip.id)
    const meters = own.reduce((sum, tr) => sum + (tr.distanceM ?? 0), 0)
    const up = own.reduce((sum, tr) => sum + (tr.ascentM ?? 0), 0)
    const sameDay =
      model.dayKeyOf(trip.startsAt, segment) ===
      model.dayKeyOf(trip.endsAt, segment)
    const detail = [
      sameDay ? null : formatDateRange(model, trip, locale),
      meters > 0 ? formatDistance(meters) : null,
      up > 0 ? t('publicJourney.ascentUp', { m: up }) : null,
    ]
      .filter((part) => part !== null)
      .join(' · ')
    return {
      detail,
      id: trip.id,
      kind: [
        t('terms.trip.singular'),
        trip.tripType === null
          ? null
          : t(`publicJourney.tripType.${trip.tripType}`),
      ]
        .filter((part) => part !== null)
        .join(' · '),
      title: trip.title,
    }
  }
  // A trip's card sits on the first day with moments on or after its start
  // (the start day itself may have none), else on the last day.
  const tripsByDay = new Map<string, DayTripCard[]>()
  for (const trip of stageTrips) {
    const startKey = model.dayKeyOf(trip.startsAt, segment)
    const host = days.find((d) => d.key >= startKey) ?? days[days.length - 1]
    if (host === undefined) continue
    tripsByDay.set(host.key, [
      ...(tripsByDay.get(host.key) ?? []),
      tripCard(trip),
    ])
  }
  const dayView = (day: JourneyDay, index: number) => {
    const all = day.moments.flatMap((m) => model.mediaByMoment.get(m.id) ?? [])
    const media = pickMosaicMedia(all, null, all.length)
    const places = [
      ...new Set(
        day.moments.flatMap((m) => {
          const known = m.latitude !== null && m.longitude !== null
          const name =
            known && m.placeId !== null
              ? model.placeById.get(m.placeId)?.name.trim()
              : undefined
          return name === undefined || name === '' ? [] : [name]
        }),
      ),
    ].slice(0, 3)
    const stops: DayStop[] = day.moments.map((m: PublicMoment) => {
      const title = publicMomentTitle(model, m, t, locale)
      const own = model.mediaByMoment.get(m.id) ?? []
      const cover = pickCover(model, m.coverMediaId, own)
      return {
        excerpt:
          m.body === '' || firstSentence(m.body) === title
            ? ''
            : excerpt(m.body, 90),
        id: m.id,
        thumb: cover !== null && resolveImage(cover) !== null ? cover : null,
        time: formatInZone(m.startsAt, zone, locale, {
          hour: 'numeric',
          minute: '2-digit',
        }),
        title,
      }
    })
    return (
      <DaySection
        color={color}
        heading={dayHeading(day.key, locale, 'long')}
        id={`day-${day.key}`}
        journeySlug={journeySlug}
        active={activeDay === day.key}
        key={day.key}
        lazy={index > 1}
        onActive={(on) => {
          setActiveDay(on ? day.key : null)
        }}
        media={media}
        note={day.note}
        number={day.number}
        places={places}
        spaceHandle={spaceHandle}
        stops={stops}
        trips={tripsByDay.get(day.key) ?? []}
        onOpenMedia={(at) => {
          setLightbox({ index: at, items: media })
        }}
      />
    )
  }

  const crumbs = [
    { label: model.data.journey.title, to: 'journey' as const },
    ...(!isStage && stage !== null && stage.id !== segment.id
      ? [{ label: stage.title, segmentId: stage.id, to: 'segment' as const }]
      : []),
    { label: segment.title },
  ]
  const badge = isStage
    ? t('publicJourney.stageOf', {
        n: stageIndex + 1,
        total: model.stages.length,
      })
    : segment.tripType === null
      ? t('terms.trip.singular')
      : t(`publicJourney.tripType.${segment.tripType}`)
  const stats = [
    {
      label: t('workspace.daysCount', { count: days.length }).replace(
        /^\d+\s*/,
        '',
      ),
      value: String(days.length),
    },
    {
      label: t('publicJourney.stopsCount', { count: stopCount }).replace(
        /^\d+\s*/,
        '',
      ),
      value: String(stopCount),
    },
    ...(spanMedia.length > 0
      ? [
          {
            label: t('publicJourney.statMedia'),
            value: String(spanMedia.length),
          },
        ]
      : []),
    ...(distance > 0
      ? [
          {
            label: t('publicJourney.statRoute'),
            value: formatDistance(distance),
          },
        ]
      : []),
    ...(ascent > 0
      ? [{ label: t('publicJourney.ascent'), value: `${String(ascent)} m` }]
      : []),
  ]
  const strip = model.stages.map((s) => ({
    color: model.stageColor(s.id),
    id: s.id,
    label: s.title,
    weight: Math.max(1, model.daysOfStage(s.id).length),
  }))
  const prev = stageIndex > 0 ? model.stages[stageIndex - 1] : undefined
  const next = stageIndex >= 0 ? model.stages[stageIndex + 1] : undefined
  const hasMap = map.points.length > 0 || map.lines.length > 0
  const mapSection = (heightClass: string) => (
    <PublicMapSection
      heightClass={heightClass}
      highlight={highlight}
      onHover={(hover) => {
        setActiveDay(hover?.dayKey ?? null)
      }}
      label={t(isStage ? 'publicJourney.regionMap' : 'publicJourney.trackMap')}
      lines={map.lines}
      points={map.points}
      onSelectPoint={(momentId) => {
        void navigate({
          params: { journeySlug, momentId, spaceHandle },
          to: '/$spaceHandle/$journeySlug/m/$momentId',
        })
      }}
    />
  )
  const railItems = days.map((day) => ({
    id: `day-${day.key}`,
    label: dayHeading(day.key, locale, 'short'),
    number: day.number,
  }))
  const starred = spanMedia.filter((m) => m.starred)

  return (
    <main className="mx-auto max-w-[75rem] px-5 py-6">
      <Crumbs
        crumbs={crumbs}
        journeySlug={journeySlug}
        spaceHandle={spaceHandle}
      />
      <header className="mt-3 space-y-3 pb-6">
        <p className="flex items-center gap-2 text-xs text-muted">
          <StageBadge color={color} label={badge} />
          <span>{formatDateRange(model, segment, locale)}</span>
        </p>
        <h1 className="reader-display text-4xl leading-[1.05] sm:text-5xl">
          {segment.title}
        </h1>
        {isStage ? (
          <StageStrip
            className="max-w-xs"
            currentId={segment.id}
            items={strip}
          />
        ) : null}
        {segment.body !== '' ? (
          <p className="reader-body max-w-[65ch] whitespace-pre-line text-lg leading-8">
            {segment.body}
          </p>
        ) : null}
        <StatRow stats={stats} />
      </header>

      <DayRail items={railItems} variant="chips" />
      {hasMap ? (
        <div className="mt-4 min-[1000px]:hidden">{mapSection('h-44')}</div>
      ) : null}

      <div className="mt-6 grid gap-8 min-[1000px]:grid-cols-[9rem_minmax(0,1fr)_21rem]">
        <DayRail items={railItems} variant="rail" />
        <div className="min-w-0 space-y-8">
          {days.length > 0 ? (
            days.map(dayView)
          ) : starred.length > 0 ? (
            <section className="space-y-3">
              <h2 className="reader-display text-2xl">
                {t('publicJourney.selectedPhotos')}
              </h2>
              <MediaGallery
                items={starred}
                label={t('publicJourney.selectedPhotos')}
              />
            </section>
          ) : (
            <p className="text-muted">{t('publicJourney.emptyStage')}</p>
          )}
        </div>
        {hasMap ? (
          <aside className="hidden self-start min-[1000px]:sticky min-[1000px]:top-6 min-[1000px]:block">
            {mapSection('h-[min(34rem,calc(100svh-3rem))]')}
          </aside>
        ) : (
          <span className="hidden min-[1000px]:block" />
        )}
      </div>

      {isStage && (prev !== undefined || next !== undefined) ? (
        <nav
          aria-label={t('publicJourney.stageNav')}
          className="mt-12 grid gap-3 sm:grid-cols-2"
        >
          {prev !== undefined ? (
            <StageLink
              direction="prev"
              journeySlug={journeySlug}
              label={t('publicJourney.prevStage')}
              segmentId={prev.id}
              spaceHandle={spaceHandle}
              title={prev.title}
            />
          ) : (
            <span />
          )}
          {next !== undefined ? (
            <StageLink
              direction="next"
              journeySlug={journeySlug}
              label={t('publicJourney.nextStage')}
              segmentId={next.id}
              spaceHandle={spaceHandle}
              title={next.title}
            />
          ) : null}
        </nav>
      ) : null}
      {!isStage && stage !== null ? (
        <nav className="mt-12">
          <StageLink
            direction="prev"
            journeySlug={journeySlug}
            label={t('publicJourney.backToStage')}
            segmentId={stage.id}
            spaceHandle={spaceHandle}
            title={stage.title}
          />
        </nav>
      ) : null}
      <div className="mt-10">
        <TargetEngagement target={{ id: segment.id, type: 'segment' }} />
      </div>
      <MediaLightbox
        index={lightbox?.index ?? null}
        items={lightbox?.items ?? []}
        onClose={closeLightbox}
        onIndexChange={moveLightbox}
      />
    </main>
  )
}

function StageLink({
  direction,
  journeySlug,
  label,
  segmentId,
  spaceHandle,
  title,
}: {
  direction: 'next' | 'prev'
  journeySlug: string
  label: string
  segmentId: string
  spaceHandle: string
  title: string
}) {
  const next = direction === 'next'
  return (
    <Link
      className={`block rounded-xl border border-border bg-surface p-4 hover:border-primary/40 ${next ? 'text-right sm:col-start-2' : ''}`}
      params={{ journeySlug, segmentId, spaceHandle }}
      to="/$spaceHandle/$journeySlug/e/$segmentId"
    >
      <span
        className={`flex items-center gap-1 text-xs text-muted ${next ? 'justify-end' : ''}`}
      >
        {next ? null : <ArrowLeft aria-hidden="true" className="size-3.5" />}
        {label}
        {next ? <ArrowRight aria-hidden="true" className="size-3.5" /> : null}
      </span>
      <span className="reader-display block text-lg">{title}</span>
    </Link>
  )
}
