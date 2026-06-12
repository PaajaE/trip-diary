import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CalendarDays,
  Camera,
  Circle,
  FileText,
  MapPin,
  Signpost,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  canContributeToJourney,
  getJourney,
} from '@/entities/journey/api/journey.repository'
import { JourneyComposer } from '@/features/journeys/ui/JourneyComposer'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'
import { JourneyMap } from '@/features/journeys/ui/JourneyMap'
import { CopyShareLink } from '@/features/sharing'
import { shareUrl as sharePublicUrl } from '@/shared/lib/share'

interface JourneyPageProps {
  journeyId: string
  shareUrl?: string
}

export function JourneyPage({ journeyId, shareUrl }: JourneyPageProps) {
  const { t } = useTranslation()
  const query = useQuery({
    queryFn: () => getJourney(journeyId),
    queryKey: ['journeys', journeyId],
  })
  const contributionQuery = useQuery({
    queryFn: () => canContributeToJourney(journeyId),
    queryKey: ['journey-contribution', journeyId],
  })
  const journey = query.data

  return (
    <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-8 sm:py-16">
      {query.isError ? (
        <p className="mt-16 text-destructive">{t('journey.error')}</p>
      ) : journey === undefined ? (
        <p className="mt-16 text-muted">{t('journey.loading')}</p>
      ) : journey === null ? (
        <p className="mt-16 text-muted">{t('journey.notFound')}</p>
      ) : (
        <>
          <header className="mt-10 overflow-hidden rounded-[2rem] border border-border bg-surface shadow-soft">
            <div className="bg-[radial-gradient(circle_at_top_left,_rgba(184,95,66,0.18),_transparent_36%),linear-gradient(135deg,_rgba(40,88,69,0.12),_rgba(255,253,248,0.8))] px-6 py-8 sm:px-8 sm:py-10">
              <p className="text-sm font-medium text-accent">
                {t(`journey.status.${journey.status}`)}
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                {journey.title}
              </h1>
              {journey.summary === '' ? (
                <p className="mt-6 max-w-2xl leading-8 text-muted">
                  {t('journey.summaryFallback')}
                </p>
              ) : (
                <p className="mt-6 max-w-2xl leading-8 text-muted">
                  {journey.summary}
                </p>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-2">
                  <CalendarDays aria-hidden="true" size={16} />
                  {formatDateRange(
                    journey.startsAt,
                    journey.endsAt,
                    t('journey.dateUnknown'),
                  )}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-2">
                  <MapPin aria-hidden="true" size={16} />
                  {t('journey.momentsCount', {
                    count: journey.stops.length + journey.entries.length,
                  })}
                </span>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {contributionQuery.data === true ? (
                  <Link
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    params={{ journeyId: journey.id }}
                    to="/j/$journeyId/memory/new"
                  >
                    <Camera aria-hidden="true" size={17} />
                    {t('journey.addPhotos')}
                  </Link>
                ) : null}
                {shareUrl === undefined ? null : (
                  <CopyShareLink
                    className="bg-white/80"
                    onCopy={() => sharePublicUrl(shareUrl, journey.title)}
                  />
                )}
              </div>
            </div>
          </header>

          <section className="py-12">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-accent">
                  {t('journey.routeEyebrow')}
                </p>
                <h2 className="mt-3 text-2xl font-semibold">
                  {t('journey.route')}
                </h2>
              </div>
            </div>
            <JourneyMap stops={journey.stops} />
            {journey.stages.length === 0 &&
            journey.stops.length === 0 &&
            journey.entries.length === 0 ? (
              <EmptyJourneyState journeyId={journey.id} />
            ) : (
              <div className="mt-8 space-y-8">
                {journey.stages.map((stage) => {
                  const stageStops = journey.stops.filter(
                    (stop) => stop.stageId === stage.id,
                  )
                  const stageEntries = journey.entries.filter(
                    (entry) => entry.stageId === stage.id,
                  )

                  return (
                    <section
                      className="rounded-[1.5rem] border border-border bg-surface p-6 shadow-soft"
                      key={stage.id}
                    >
                      <h3 className="flex items-center gap-3 text-xl font-semibold">
                        <Signpost aria-hidden="true" size={18} />
                        {stage.title}
                      </h3>
                      <div className="mt-6 space-y-4">
                        {stageStops.map((stop) => (
                          <article
                            className="rounded-xl border border-border/80 bg-background/70 p-4"
                            key={stop.id}
                          >
                            <p className="flex items-center gap-3 font-semibold">
                              {stop.status === 'planned' ? (
                                <Circle aria-hidden="true" size={14} />
                              ) : (
                                <MapPin aria-hidden="true" size={16} />
                              )}
                              {stop.title}
                            </p>
                          </article>
                        ))}
                        {stageEntries.map((entry) => (
                          <article
                            className="rounded-xl border border-border/80 bg-background/70 p-4"
                            key={entry.id}
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                              {t(`entry.type.${entry.type}`)}
                            </p>
                            <h4 className="mt-2 text-lg font-semibold">
                              {entry.title ?? t('dashboard.untitled')}
                            </h4>
                            {entry.body === '' ? null : (
                              <p className="mt-3 line-clamp-3 leading-7 text-muted">
                                {entry.body}
                              </p>
                            )}
                            <PhotoGallery
                              alt={entry.title ?? t('dashboard.untitled')}
                              entryId={entry.id}
                            />
                          </article>
                        ))}
                        {stageStops.length === 0 &&
                        stageEntries.length === 0 ? (
                          <p className="text-sm text-muted">
                            {t('journey.emptyStage')}
                          </p>
                        ) : null}
                      </div>
                    </section>
                  )
                })}
                {journey.stops.filter((stop) => stop.stageId === null).length >
                  0 ||
                journey.entries.filter((entry) => entry.stageId === null)
                  .length > 0 ? (
                  <section className="rounded-[1.5rem] border border-border bg-surface p-6 shadow-soft">
                    <h3 className="text-xl font-semibold">
                      {t('journey.freeMoments')}
                    </h3>
                    <div className="mt-6 space-y-4">
                      {journey.stops
                        .filter((stop) => stop.stageId === null)
                        .map((stop) => (
                          <article
                            className="rounded-xl border border-border/80 bg-background/70 p-4"
                            key={stop.id}
                          >
                            <p className="flex items-center gap-3 font-semibold">
                              {stop.status === 'planned' ? (
                                <Circle aria-hidden="true" size={14} />
                              ) : (
                                <MapPin aria-hidden="true" size={16} />
                              )}
                              {stop.title}
                            </p>
                          </article>
                        ))}
                      {journey.entries
                        .filter((entry) => entry.stageId === null)
                        .map((entry) => (
                          <article
                            className="rounded-xl border border-border/80 bg-background/70 p-4"
                            key={entry.id}
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                              {t(`entry.type.${entry.type}`)}
                            </p>
                            <h4 className="mt-2 text-lg font-semibold">
                              {entry.title ?? t('dashboard.untitled')}
                            </h4>
                            {entry.body === '' ? null : (
                              <p className="mt-3 line-clamp-3 leading-7 text-muted">
                                {entry.body}
                              </p>
                            )}
                            <PhotoGallery
                              alt={entry.title ?? t('dashboard.untitled')}
                              entryId={entry.id}
                            />
                          </article>
                        ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </section>

          {contributionQuery.data === true ? (
            <JourneyComposer
              journey={journey}
              onChanged={() => {
                void query.refetch()
              }}
            />
          ) : null}
        </>
      )}
    </main>
  )
}

function EmptyJourneyState({ journeyId }: { journeyId: string }) {
  const { t } = useTranslation()

  return (
    <div className="mt-8 rounded-[1.5rem] border border-dashed border-border bg-surface p-6 shadow-soft">
      <h3 className="text-xl font-semibold">{t('journey.emptyTitle')}</h3>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        {t('journey.emptyRoute')}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link
          className="rounded-xl border border-border bg-background/70 p-4 transition-colors hover:bg-white"
          params={{ journeyId }}
          to="/j/$journeyId/memory/new"
        >
          <Camera aria-hidden="true" size={18} />
          <p className="mt-3 font-semibold">{t('journey.addPhotos')}</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t('journey.photoDescription')}
          </p>
        </Link>
        <a
          className="rounded-xl border border-border bg-background/70 p-4"
          href="#journey-capture"
        >
          <MapPin aria-hidden="true" size={18} />
          <p className="mt-3 font-semibold">{t('journey.addPlace')}</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t('journey.placeDescription')}
          </p>
        </a>
        <Link
          className="rounded-xl border border-border bg-background/70 p-4 transition-colors hover:bg-white"
          params={{ journeyId }}
          to="/j/$journeyId/memory/new"
        >
          <FileText aria-hidden="true" size={18} />
          <p className="mt-3 font-semibold">{t('journey.addNote')}</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t('journey.noteDescription')}
          </p>
        </Link>
      </div>
    </div>
  )
}

function formatDateRange(
  startsAt: string | null,
  endsAt: string | null,
  fallback: string,
) {
  if (startsAt === null && endsAt === null) {
    return fallback
  }
  if (startsAt !== null && endsAt !== null) {
    return `${startsAt} - ${endsAt}`
  }
  return startsAt ?? endsAt ?? fallback
}
