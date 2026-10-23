import { Link, useNavigate } from '@tanstack/react-router'
import type {
  PublicJourney,
  PublicMoment,
  PublicSegment,
} from '@trip-diary/core/public-journey'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildJourneyModel,
  formatInZone,
  type JourneyModel,
  localDayKey,
  pickCover,
  zoneOf,
} from '@/entities/public-journey/lib/journey-model'
import { resolveImage } from '@/entities/public-journey/lib/media-url'
import { buildMapData } from '@/features/public-journey/lib/build-map-data'
import {
  excerpt,
  formatDateRange,
  formatDistance,
} from '@/features/public-journey/lib/format'
import { publicMomentTitle } from '@/features/public-journey/lib/moment-title'
import { PublicMapSection } from '@/features/public-journey/ui/LazyPublicJourneyMap'
import { TargetEngagement } from '@/features/public-engagement/ui/CommentsSection'
import { MediaGallery } from '@/features/public-journey/ui/MediaGallery'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'
import { Crumbs } from '@/features/public-journey/ui/Crumbs'
import { PublicRouteNotFound } from '@/pages/public-space/PublicRouteMessage'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'

interface Props {
  data: PublicJourney
  journeySlug: string
  segmentId: string
  spaceHandle: string
}

interface DayGroup {
  day: string
  label: string
  moments: PublicMoment[]
}

function groupByDay(
  moments: PublicMoment[],
  zone: string,
  locale: string,
): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  for (const moment of moments) {
    const day = localDayKey(moment.startsAt, zone)
    const group = groups.get(day) ?? {
      day,
      label: formatInZone(moment.startsAt, zone, locale, {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
        year: 'numeric',
      }),
      moments: [],
    }
    group.moments.push(moment)
    groups.set(day, group)
  }
  return [...groups.values()]
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

function SegmentView({ journeySlug, model, segment, spaceHandle }: ViewProps) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const isStage = segment.kind === 'stage'
  const map = useMemo(
    () => buildMapData(model, segment.id),
    [model, segment.id],
  )
  const spanMedia = model.mediaInSpan(segment.id)
  const cover = pickCover(model, segment.coverMediaId, spanMedia)
  const coverImage = cover === null ? null : resolveImage(cover)
  const zone = zoneOf(model, segment)
  const trips = isStage ? model.tripsOfStage(segment.id) : []
  const tracks = model.data.tracks.filter((track) => {
    const owner = model.segmentById.get(track.segmentId)
    return (
      track.segmentId === segment.id ||
      (owner !== undefined &&
        Date.parse(segment.startsAt) <= Date.parse(owner.startsAt) &&
        Date.parse(owner.endsAt) <= Date.parse(segment.endsAt))
    )
  })
  const distance = tracks.reduce(
    (sum, track) => sum + (track.distanceM ?? 0),
    0,
  )
  const ascent = tracks.reduce((sum, track) => sum + (track.ascentM ?? 0), 0)
  const hasTrackStats = !isStage && tracks.length > 0
  const stage = model.stageOf(segment.id)
  const ownMoments = model.momentsOfSegment(segment.id)
  const starred = spanMedia.filter((m) => m.starred)
  useDocumentMeta({
    ...(segment.body !== '' ? { description: excerpt(segment.body) } : {}),
    ...(coverImage !== null ? { imageUrl: coverImage.src } : {}),
    title: `${segment.title} · ${model.data.journey.title}`,
  })

  const crumbs = [
    {
      label: model.data.journey.title,
      to: 'journey' as const,
    },
    ...(!isStage && stage !== null && stage.id !== segment.id
      ? [
          {
            label: stage.title,
            segmentId: stage.id,
            to: 'segment' as const,
          },
        ]
      : []),
    { label: segment.title },
  ]

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <Crumbs
        crumbs={crumbs}
        journeySlug={journeySlug}
        spaceHandle={spaceHandle}
      />
      <header className="space-y-3">
        {cover !== null ? (
          <div
            className="overflow-hidden rounded-lg bg-surface"
            style={{ aspectRatio: '16 / 9' }}
          >
            <PublicMediaView
              className="h-full w-full object-cover"
              media={cover}
              priority
              sizes="(min-width: 896px) 896px, 100vw"
            />
          </div>
        ) : null}
        <h1 className="text-3xl font-semibold">{segment.title}</h1>
        <p className="text-sm text-muted">
          {formatDateRange(model, segment, i18n.language)}
          {segment.tripType !== null
            ? ` · ${t(`publicJourney.tripType.${segment.tripType}`)}`
            : ''}
        </p>
        {hasTrackStats ? (
          <dl className="flex gap-6 text-sm">
            {distance > 0 ? (
              <div>
                <dt className="text-muted">{t('publicJourney.distance')}</dt>
                <dd className="font-semibold">{formatDistance(distance)}</dd>
              </div>
            ) : null}
            {ascent > 0 ? (
              <div>
                <dt className="text-muted">{t('publicJourney.ascent')}</dt>
                <dd className="font-semibold">{`${String(ascent)} m`}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {segment.body !== '' ? (
          <p className="whitespace-pre-line leading-7">{segment.body}</p>
        ) : null}
      </header>

      {map.points.length > 0 || map.lines.length > 0 ? (
        <PublicMapSection
          label={t(
            isStage ? 'publicJourney.regionMap' : 'publicJourney.trackMap',
          )}
          lines={map.lines}
          onSelectPoint={(momentId) => {
            void navigate({
              params: { journeySlug, momentId, spaceHandle },
              to: '/$spaceHandle/$journeySlug/m/$momentId',
            })
          }}
          points={map.points}
        />
      ) : null}

      {trips.length > 0 ? (
        <section className="space-y-8">
          <h2 className="text-xl font-semibold">{t('publicJourney.trips')}</h2>
          {trips.map((trip) => {
            const tripStarred = model
              .mediaInSpan(trip.id)
              .filter((m) => m.starred)
              .slice(0, 8)
            return (
              <article className="space-y-3" key={trip.id}>
                <h3 className="text-lg font-semibold">
                  <Link
                    className="underline"
                    params={{ journeySlug, segmentId: trip.id, spaceHandle }}
                    to="/$spaceHandle/$journeySlug/e/$segmentId"
                  >
                    {trip.title}
                  </Link>
                </h3>
                <p className="text-sm text-muted">
                  {formatDateRange(model, trip, i18n.language)}
                </p>
                {trip.body !== '' ? (
                  <p className="leading-7">{excerpt(trip.body, 280)}</p>
                ) : null}
                <MediaGallery items={tripStarred} label={trip.title} />
              </article>
            )
          })}
        </section>
      ) : null}

      {ownMoments.length > 0 ? (
        <section className="space-y-6">
          <h2 className="text-xl font-semibold">
            {t('publicJourney.narrative')}
          </h2>
          {groupByDay(ownMoments, zone, i18n.language).map((group) => (
            <div className="space-y-3" key={group.day}>
              <h3 className="font-semibold">{group.label}</h3>
              {group.moments.map((moment) => (
                <div className="space-y-1" key={moment.id}>
                  <Link
                    className="font-medium underline"
                    params={{ journeySlug, momentId: moment.id, spaceHandle }}
                    to="/$spaceHandle/$journeySlug/m/$momentId"
                  >
                    {publicMomentTitle(model, moment, t, i18n.language)}
                  </Link>
                  {moment.body !== '' ? (
                    <p className="whitespace-pre-line leading-7">
                      {excerpt(moment.body, 400)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      {(!isStage || trips.length === 0) && starred.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            {t('publicJourney.selectedPhotos')}
          </h2>
          <MediaGallery
            items={starred}
            label={t('publicJourney.selectedPhotos')}
          />
        </section>
      ) : null}
      <TargetEngagement target={{ id: segment.id, type: 'segment' }} />
    </main>
  )
}
