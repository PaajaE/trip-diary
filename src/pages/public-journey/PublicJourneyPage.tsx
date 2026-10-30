import { useNavigate } from '@tanstack/react-router'
import {
  buildJourneyStats,
  buildMapPreview,
  formatJourneyPeriod,
  type PublicJourney,
} from '@trip-diary/core/public-journey'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildJourneyModel,
  effectiveJourneyStatus,
  pickCover,
} from '@/entities/public-journey/lib/journey-model'
import { readHeroMirror } from '@/entities/public-journey/lib/embedded-journey'
import { resolveImage } from '@/entities/public-journey/lib/media-url'
import { GreetAuthorsBar } from '@/features/public-journey/ui/GreetAuthorsBar'
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
import { readingKey } from '@/features/public-journey/lib/reading-position'
import { useSavedReadingPosition } from '@/features/public-journey/lib/use-reading-position'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { PlaceAttribution } from '@/shared/ui/PlaceAttribution'

interface PublicJourneyPageProps {
  data: PublicJourney
  journeySlug: string
  spaceHandle: string
}

/** Long journeys open with this many stage cards; the rest sits behind one tap. */
const STAGES_SHOWN_FIRST = 6

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
  // Stage under the pointer in the legend, on the map or on the strip.
  const [activeStage, setActiveStage] = useState<string | null>(null)
  const highlight = useMemo(
    () =>
      activeStage === null ? null : { dayKey: null, stageId: activeStage },
    [activeStage],
  )
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
  // Read once: "still ahead" must not flicker on re-render.
  const [now] = useState(() => Date.now())
  type StageInfo = (typeof stageInfo)[number]
  const renderStage = (info: StageInfo, index: number) => (
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
        upcoming={Date.parse(info.stage.startsAt) > now}
      />
    </li>
  )
  const firstStage = model.stages[0]
  const saved = useSavedReadingPosition(readingKey(spaceHandle, journeySlug))
  // Only a bookmark that still points at a stage and is past the very start.
  const resume = (() => {
    if (saved === null) return null
    const days = model.daysOfStage(saved.stageId)
    if (days.length === 0) return null
    const atStart =
      saved.stageId === firstStage?.id &&
      saved.dayId === `day-${days[0]?.key ?? ''}`
    return atStart ? null : { ...saved, journeySlug, spaceHandle }
  })()
  const hasPlaces = data.places.length > 0
  const hasRoute = map.points.length > 0 || map.lines.length > 0
  const hasRouteSection = hasRoute || stageInfo.length > 0
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
    ...(hasRouteSection
      ? [{ id: 'route', label: t('publicJourney.route') }]
      : []),
    ...(stageInfo.length > 0
      ? [{ id: 'stages', label: t('publicJourney.stages') }]
      : []),
    ...(hasPlaces ? [{ id: 'places', label: t('publicJourney.places') }] : []),
  ]

  return (
    <main>
      <JourneyHero
        cover={cover}
        eyebrow={`${t(`publicJourney.status${statusKey(effectiveJourneyStatus(data))}`)} · ${journey.space.name}`}
        mirror={heroMirror}
        period={formatJourneyPeriod(
          journey.startsAt,
          journey.endsAt,
          i18n.language,
        )}
        resume={
          resume === null ? null : { ...resume, segmentId: resume.stageId }
        }
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

        {hasRouteSection ? (
          <section
            aria-labelledby="route-heading"
            className="scroll-mt-[calc(var(--reader-bar-h)+3.5rem)] space-y-4"
            id="route"
          >
            <div>
              <h2 className="reader-display text-3xl" id="route-heading">
                {t('publicJourney.route')}
              </h2>
              {hasRoute ? (
                <p className="mt-1 text-sm text-muted">
                  {t('publicJourney.routeHint')}
                </p>
              ) : null}
            </div>
            {strip.length > 0 ? (
              <StageStrip currentId={activeStage ?? undefined} items={strip} />
            ) : null}
            <div
              className={
                hasRoute
                  ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]'
                  : 'grid gap-5'
              }
            >
              {hasRoute ? (
                <PublicMapSection
                  highlight={highlight}
                  label={t('publicJourney.routeMap')}
                  lines={map.lines}
                  onHover={(hover) => {
                    setActiveStage(hover?.stageId ?? null)
                  }}
                  onSelectPoint={(momentId) => {
                    void navigate({
                      params: { journeySlug, momentId, spaceHandle },
                      to: '/$spaceHandle/$journeySlug/m/$momentId',
                    })
                  }}
                  points={map.points}
                  preview={preview}
                />
              ) : null}
              <StageLegend
                activeId={activeStage}
                items={legend}
                onActive={setActiveStage}
                journeySlug={journeySlug}
                spaceHandle={spaceHandle}
              />
            </div>
          </section>
        ) : null}

        {stageInfo.length > 0 ? (
          <section
            aria-labelledby="stages-heading"
            className="scroll-mt-[calc(var(--reader-bar-h)+3.5rem)] space-y-4"
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
              {stageInfo
                .slice(0, STAGES_SHOWN_FIRST)
                .map((info, index) => renderStage(info, index))}
            </ul>
            {stageInfo.length > STAGES_SHOWN_FIRST ? (
              <details className="group space-y-5">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent-strong underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden group-open:hidden">
                  {t('publicJourney.stagesShowRest', {
                    count: stageInfo.length - STAGES_SHOWN_FIRST,
                  })}
                </summary>
                <ul className="grid gap-5 md:grid-cols-2">
                  {stageInfo
                    .slice(STAGES_SHOWN_FIRST)
                    .map((info, index) =>
                      renderStage(info, index + STAGES_SHOWN_FIRST),
                    )}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}

        {hasPlaces ? (
          <section
            aria-labelledby="places-heading"
            className="scroll-mt-[calc(var(--reader-bar-h)+3.5rem)] space-y-3"
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
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent-strong underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden group-open:hidden">
                {t('publicJourney.placesShow', { count: data.places.length })}
              </summary>
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
            </details>
            <PlaceAttribution />
          </section>
        ) : null}
        <TargetEngagement target={{ id: journey.id, type: 'journey' }} />
        <GreetAuthorsBar feedHref={`/${spaceHandle}/${journeySlug}/feed.xml`} />
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
