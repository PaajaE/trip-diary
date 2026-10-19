import { Link, useNavigate } from '@tanstack/react-router'
import type { PublicJourney } from '@trip-diary/core/public-journey'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildJourneyModel,
  formatInZone,
  pickCover,
  zoneOf,
} from '@/entities/public-journey/lib/journey-model'
import { buildMapPreview } from '@trip-diary/core/public-journey'
import { buildMapData } from '@/features/public-journey/lib/build-map-data'
import { excerpt, formatDateRange } from '@/features/public-journey/lib/format'
import { TargetEngagement } from '@/features/public-engagement/ui/CommentsSection'
import { PublicMapSection } from '@/features/public-journey/ui/LazyPublicJourneyMap'
import { PublicMediaView } from '@/features/public-journey/ui/PublicMediaView'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { PlaceAttribution } from '@/shared/ui/PlaceAttribution'
import { readHeroMirror } from '@/entities/public-journey/lib/embedded-journey'
import { resolveImage } from '@/entities/public-journey/lib/media-url'

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

  const timeline = [...data.segments].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  )

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-5 py-8">
      <header className="space-y-4">
        {cover !== null ? (
          <div
            className="overflow-hidden rounded-lg bg-surface"
            style={{ aspectRatio: '16 / 9' }}
          >
            <PublicMediaView
              className="h-full w-full object-cover"
              media={cover}
              mirror={heroMirror}
              priority
              sizes="(min-width: 1024px) 1024px, 100vw"
            />
          </div>
        ) : null}
        <p className="text-sm text-muted">{journey.space.name}</p>
        <h1 className="text-3xl font-semibold">{journey.title}</h1>
        {journey.startsAt !== null ? (
          <p className="text-sm text-muted">
            {journey.startsAt}
            {journey.endsAt !== null ? ` – ${journey.endsAt}` : ''}
          </p>
        ) : null}
        {journey.summary !== '' ? (
          <p className="whitespace-pre-line leading-7">{journey.summary}</p>
        ) : null}
      </header>

      <section aria-labelledby="route-heading" className="space-y-3">
        <h2 className="text-xl font-semibold" id="route-heading">
          {t('publicJourney.route')}
        </h2>
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
      </section>

      {model.stages.length > 0 ? (
        <section aria-labelledby="stages-heading" className="space-y-4">
          <h2 className="text-xl font-semibold" id="stages-heading">
            {t('publicJourney.stages')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {model.stages.map((stage) => {
              const media = model.mediaInSpan(stage.id)
              const stageCover = pickCover(model, stage.coverMediaId, media)
              const momentCount = model.momentsInSpan(stage.id).length
              const color = model.stageColor(stage.id)
              return (
                <li key={stage.id}>
                  <Link
                    className="block overflow-hidden rounded-lg border border-border bg-surface"
                    params={{ journeySlug, segmentId: stage.id, spaceHandle }}
                    to="/$spaceHandle/$journeySlug/e/$segmentId"
                  >
                    <div
                      className="bg-border"
                      style={{
                        aspectRatio: '3 / 2',
                        borderBottom: `4px solid ${color}`,
                      }}
                    >
                      {stageCover !== null ? (
                        <PublicMediaView
                          className="h-full w-full object-cover"
                          media={stageCover}
                          sizes="(min-width: 640px) 50vw, 100vw"
                        />
                      ) : null}
                    </div>
                    <div className="space-y-1 p-4">
                      <h3 className="text-lg font-semibold">{stage.title}</h3>
                      <p className="text-sm text-muted">
                        {formatDateRange(model, stage, i18n.language)}
                      </p>
                      <p className="text-sm text-muted">
                        {t('publicJourney.counts', {
                          moments: momentCount,
                          photos: media.length,
                        })}
                      </p>
                      {stage.body !== '' ? (
                        <p className="text-sm leading-6">
                          {excerpt(stage.body)}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {timeline.length > 0 ? (
        <section aria-labelledby="timeline-heading" className="space-y-4">
          <h2 className="text-xl font-semibold" id="timeline-heading">
            {t('publicJourney.timeline')}
          </h2>
          <ol className="space-y-2 border-l-2 border-border pl-4">
            {timeline.map((segment) => (
              <li
                className={segment.kind === 'trip' ? 'ml-4' : ''}
                key={segment.id}
              >
                <Link
                  className="font-medium underline"
                  params={{ journeySlug, segmentId: segment.id, spaceHandle }}
                  to="/$spaceHandle/$journeySlug/e/$segmentId"
                >
                  {segment.title}
                </Link>{' '}
                <span className="text-sm text-muted">
                  {formatInZone(
                    segment.startsAt,
                    zoneOf(model, segment),
                    i18n.language,
                    { day: 'numeric', month: 'short' },
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {data.places.length > 0 ? (
        <section aria-labelledby="places-heading" className="space-y-2">
          <h2 className="text-xl font-semibold" id="places-heading">
            {t('publicJourney.places')}
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {data.places.map((place) => (
              <li
                className="rounded-full border border-border px-3 py-1"
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
    </main>
  )
}
