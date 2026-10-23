import { useNavigate } from '@tanstack/react-router'
import {
  buildJourneyStats,
  buildMapPreview,
  formatJourneyPeriod,
  type PublicJourney,
} from '@trip-diary/core/public-journey'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildJourneyModel,
  pickCover,
} from '@/entities/public-journey/lib/journey-model'
import { readHeroMirror } from '@/entities/public-journey/lib/embedded-journey'
import { resolveImage } from '@/entities/public-journey/lib/media-url'
import { TargetEngagement } from '@/features/public-engagement/ui/CommentsSection'
import { buildMapData } from '@/features/public-journey/lib/build-map-data'
import { excerpt, formatDateRange } from '@/features/public-journey/lib/format'
import { pickMosaicMedia } from '@/features/public-journey/lib/mosaic-media'
import { JourneyHero } from '@/features/public-journey/ui/JourneyHero'
import { PublicMapSection } from '@/features/public-journey/ui/LazyPublicJourneyMap'
import { SectionNav } from '@/features/public-journey/ui/SectionNav'
import { StageCard } from '@/features/public-journey/ui/StageCard'
import {
  StageLegend,
  type StageLegendItem,
} from '@/features/public-journey/ui/StageLegend'
import {
  StageStrip,
  type StageStripItem,
} from '@/features/public-journey/ui/StageStrip'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { PlaceAttribution } from '@/shared/ui/PlaceAttribution'

interface PublicJourneyPageProps {
  data: PublicJourney
  journeySlug: string
  spaceHandle: string
}

export function PublicJourneyPage({
  data,
  journeySlug,
  spaceHandle,
}: PublicJourneyPageProps) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const model = useMemo(() => buildJourneyModel(data), [data])
  const map = useMemo(() => buildMapData(model, null), [model])
  const preview = useMemo(() => buildMapPreview(data), [data])
  const stats = useMemo(() => buildJourneyStats(data), [data])
  // Same-origin hero copy of the prerendered page: the image the static shell
  // already loaded, so React does not download it a second time.
  const heroMirror = useMemo(() => readHeroMirror(), [])
  const { journey } = data
  const cover = pickCover(
    model,
    journey.coverMediaId,
    data.media.filter((m) => m.kind === 'photo'),
  )
  const coverImage = cover === null ? null : resolveImage(cover)
  useDocumentMeta({
    ...(journey.summary !== ''
      ? { description: excerpt(journey.summary) }
      : {}),
    ...(coverImage !== null ? { imageUrl: coverImage.src } : {}),
    title: `${journey.title} · ${journey.space.name}`,
  })

  const stageInfo = useMemo(
    () =>
      model.stages.map((stage) => {
        const media = model.mediaInSpan(stage.id)
        const days = model.daysOfStage(stage.id).length
        return {
          color: model.stageColor(stage.id),
          days,
          media,
          mosaic: pickMosaicMedia(media, stage.coverMediaId),
          moments: model.momentsInSpan(stage.id).length,
          stage,
        }
      }),
    [model],
  )
  const firstStage = model.stages[0]
  const hasPlaces = data.places.length > 0
  const statItems = [
    { label: t('publicJourney.statDays'), value: String(stats.days) },
    ...(stats.stages > 0
      ? [{ label: t('publicJourney.statStages'), value: String(stats.stages) }]
      : []),
    ...(stats.distanceKm > 0
      ? [
          {
            label: t('publicJourney.statRoute'),
            value: `${String(stats.distanceKm)} km`,
          },
        ]
      : []),
    ...(stats.media > 0
      ? [{ label: t('publicJourney.statMedia'), value: String(stats.media) }]
      : []),
  ]
  const strip: StageStripItem[] = stageInfo.map((info) => ({
    color: info.color,
    id: info.stage.id,
    label: info.stage.title,
    weight: Math.max(1, info.days),
  }))
  const legend: StageLegendItem[] = stageInfo.map((info) => ({
    color: info.color,
    detail: `${formatDateRange(model, info.stage, i18n.language)} · ${t('workspace.daysCount', { count: info.days })}`,
    id: info.stage.id,
    mediaCount: info.media.length,
    thumb: info.mosaic[0] ?? null,
    title: info.stage.title,
  }))
  const nav = [
    { id: 'route', label: t('publicJourney.route') },
    ...(stageInfo.length > 0
      ? [{ id: 'stages', label: t('publicJourney.stages') }]
      : []),
    ...(hasPlaces ? [{ id: 'places', label: t('publicJourney.places') }] : []),
  ]

  return (
    <main>
      <JourneyHero
        cover={cover}
        eyebrow={`${t(`publicJourney.status${statusKey(journey.status)}`)} · ${journey.space.name}`}
        mirror={heroMirror}
        period={formatJourneyPeriod(
          journey.startsAt,
          journey.endsAt,
          i18n.language,
        )}
        start={
          firstStage === undefined
            ? null
            : { journeySlug, segmentId: firstStage.id, spaceHandle }
        }
        stats={statItems}
        title={journey.title}
      />
      <SectionNav items={nav} />
      <div className="mx-auto max-w-6xl space-y-14 px-5 py-10">
        {journey.summary !== '' ? (
          <p className="reader-body max-w-[65ch] whitespace-pre-line text-lg leading-8">
            {journey.summary}
          </p>
        ) : null}

        <section
          aria-labelledby="route-heading"
          className="scroll-mt-16 space-y-4"
          id="route"
        >
          <div>
            <h2 className="reader-display text-3xl" id="route-heading">
              {t('publicJourney.route')}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t('publicJourney.routeHint')}
            </p>
          </div>
          {strip.length > 0 ? <StageStrip items={strip} /> : null}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <PublicMapSection
              label={t('publicJourney.routeMap')}
              lines={map.lines}
              onSelectPoint={(momentId) => {
                void navigate({
                  params: { journeySlug, momentId, spaceHandle },
                  to: '/$spaceHandle/$journeySlug/m/$momentId',
                })
              }}
              points={map.points}
              preview={preview}
            />
            <StageLegend
              items={legend}
              journeySlug={journeySlug}
              spaceHandle={spaceHandle}
            />
          </div>
        </section>

        {stageInfo.length > 0 ? (
          <section
            aria-labelledby="stages-heading"
            className="scroll-mt-16 space-y-4"
            id="stages"
          >
            <div>
              <h2 className="reader-display text-3xl" id="stages-heading">
                {t('publicJourney.stages')}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t('publicJourney.stagesIntro')}
              </p>
            </div>
            <ul className="grid gap-5 md:grid-cols-2">
              {stageInfo.map((info, index) => (
                <li
                  className={index === 0 ? 'md:col-span-2' : undefined}
                  key={info.stage.id}
                >
                  <StageCard
                    badge={t('publicJourney.stageBadge', { n: index + 1 })}
                    body={excerpt(info.stage.body, 200)}
                    color={info.color}
                    counts={`${t('publicJourney.stopsCount', { count: info.moments })} · ${t('publicJourney.mediaCount', { count: info.media.length })}`}
                    featured={index === 0}
                    journeySlug={journeySlug}
                    media={info.mosaic}
                    mediaTotal={info.media.length}
                    range={`${formatDateRange(model, info.stage, i18n.language)} · ${t('workspace.daysCount', { count: info.days })}`}
                    segmentId={info.stage.id}
                    spaceHandle={spaceHandle}
                    title={info.stage.title}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasPlaces ? (
          <section
            aria-labelledby="places-heading"
            className="scroll-mt-16 space-y-3"
            id="places"
          >
            <div>
              <h2 className="reader-display text-3xl" id="places-heading">
                {t('publicJourney.places')}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t('publicJourney.placesIntro')}
              </p>
            </div>
            <ul className="flex flex-wrap gap-2 text-sm">
              {data.places.map((place) => (
                <li
                  className="rounded-full border border-border bg-surface px-3 py-1"
                  key={place.id}
                >
                  {place.name}
                  {place.region !== null ? `, ${place.region}` : ''}
                </li>
              ))}
            </ul>
            <PlaceAttribution />
          </section>
        ) : null}
        <TargetEngagement target={{ id: journey.id, type: 'journey' }} />
      </div>
    </main>
  )
}

function statusKey(status: PublicJourney['journey']['status']) {
  return status === 'planning'
    ? 'Planning'
    : status === 'active'
      ? 'Active'
      : 'Completed'
}
