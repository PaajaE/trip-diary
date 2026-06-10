import { useQuery } from '@tanstack/react-query'
import { Circle, MapPin, Signpost } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  canContributeToJourney,
  getJourney,
} from '@/entities/journey/api/journey.repository'
import { JourneyComposer } from '@/features/journeys/ui/JourneyComposer'
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
          <header className="mt-16 border-b border-border pb-12">
            <p className="text-sm font-medium text-accent">
              {t(`journey.status.${journey.status}`)}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
              {journey.title}
            </h1>
            {journey.summary === '' ? null : (
              <p className="mt-6 max-w-2xl leading-8 text-muted">
                {journey.summary}
              </p>
            )}
            {shareUrl === undefined ? null : (
              <CopyShareLink
                className="mt-6"
                onCopy={() => sharePublicUrl(shareUrl, journey.title)}
              />
            )}
          </header>

          <section className="py-12">
            <h2 className="text-2xl font-semibold">{t('journey.route')}</h2>
            <JourneyMap stops={journey.stops} />
            {journey.stages.length === 0 && journey.stops.length === 0 ? (
              <p className="mt-4 text-muted">{t('journey.emptyRoute')}</p>
            ) : (
              <div className="mt-8 space-y-8 border-l border-border pl-6">
                {journey.stages.map((stage) => (
                  <div key={stage.id}>
                    <h3 className="flex items-center gap-3 text-lg font-semibold">
                      <Signpost aria-hidden="true" size={18} />
                      {stage.title}
                    </h3>
                    {journey.stops
                      .filter((stop) => stop.stageId === stage.id)
                      .map((stop) => (
                        <p
                          className="mt-4 flex items-center gap-3 text-muted"
                          key={stop.id}
                        >
                          {stop.status === 'planned' ? (
                            <Circle aria-hidden="true" size={14} />
                          ) : (
                            <MapPin aria-hidden="true" size={16} />
                          )}
                          {stop.title}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          {journey.guides.length === 0 ? null : (
            <section className="border-t border-border py-12">
              <h2 className="text-2xl font-semibold">{t('journey.guide')}</h2>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                {journey.guides.map((guide) => (
                  <article className="rounded-lg bg-surface p-5" key={guide.id}>
                    <h3 className="font-semibold">{guide.title}</h3>
                    <p className="mt-3 leading-7 text-muted">{guide.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
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
