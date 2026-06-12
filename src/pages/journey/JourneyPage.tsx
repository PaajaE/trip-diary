import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  CalendarDays,
  Camera,
  Circle,
  FileText,
  Images,
  MapPin,
  Signpost,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  canContributeToJourney,
  getJourney,
} from '@/entities/journey/api/journey.repository'
import { JourneyComposer } from '@/features/journeys/ui/JourneyComposer'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'
import {
  composeJourneyContent,
  type JourneyMoment,
  type JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
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
  const content =
    journey === null || journey === undefined
      ? null
      : composeJourneyContent(journey)

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
                    count: content?.moments.length ?? 0,
                  })}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-2">
                  <MapPin aria-hidden="true" size={16} />
                  {t('journey.mappedCount', {
                    count: content?.locatedMomentCount ?? 0,
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

          <nav
            aria-label={t('journey.explore')}
            className="sticky top-3 z-10 mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-soft backdrop-blur"
          >
            <JourneyNavLink
              href="#story"
              icon={BookOpen}
              label={t('journey.story')}
            />
            <JourneyNavLink
              href="#map"
              icon={MapPin}
              label={t('journey.map')}
            />
            <JourneyNavLink
              href="#gallery"
              icon={Images}
              label={t('journey.gallery')}
            />
          </nav>

          <section className="scroll-mt-24 py-12" id="story">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-accent">
                  {t('journey.storyEyebrow')}
                </p>
                <h2 className="mt-3 text-2xl font-semibold">
                  {t('journey.story')}
                </h2>
              </div>
            </div>
            {journey.stages.length === 0 &&
            journey.stops.length === 0 &&
            journey.entries.length === 0 ? (
              <EmptyJourneyState journeyId={journey.id} />
            ) : (
              <div className="mt-8 space-y-8">
                {content?.stageContents.map((stageContent) => (
                  <StageContent
                    content={stageContent}
                    key={stageContent.stage?.id ?? 'unassigned'}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="scroll-mt-24 py-12" id="map">
            <SectionHeading
              eyebrow={t('journey.mapEyebrow')}
              title={t('journey.map')}
            />
            <JourneyMap
              moments={content?.moments ?? []}
              plannedStops={content?.plannedStops ?? []}
            />
            {journey.stops.every(
              (stop) => stop.mapLatitude === null || stop.mapLongitude === null,
            ) ? (
              <p className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-6 text-muted">
                {t('journey.mapEmpty')}
              </p>
            ) : null}
          </section>

          <section className="scroll-mt-24 py-12" id="gallery">
            <SectionHeading
              eyebrow={t('journey.galleryEyebrow')}
              title={t('journey.gallery')}
            />
            <JourneyGallery moments={content?.moments ?? []} />
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

function JourneyNavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof BookOpen
  label: string
}) {
  return (
    <a
      className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors hover:bg-background"
      href={href}
    >
      <Icon aria-hidden="true" size={16} />
      {label}
    </a>
  )
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string
  title: string
}) {
  return (
    <div>
      <p className="text-sm font-medium text-accent">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold">{title}</h2>
    </div>
  )
}

function StageContent({ content }: { content: JourneyStageContent }) {
  const { t } = useTranslation()

  return (
    <section className="rounded-[1.5rem] border border-border bg-surface p-6 shadow-soft">
      <h3 className="flex items-center gap-3 text-xl font-semibold">
        <Signpost aria-hidden="true" size={18} />
        {content.stage?.title ?? t('journey.freeMoments')}
      </h3>
      <div className="mt-6 space-y-4">
        {content.moments.map((moment) => (
          <MomentCard key={moment.entry.id} moment={moment} />
        ))}
        {content.plannedStops.length === 0 ? null : (
          <div className="pt-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {t('journey.plannedPlaces')}
            </p>
            <div className="space-y-3">
              {content.plannedStops.map((stop) => (
                <article
                  className="rounded-xl border border-dashed border-border bg-background/60 p-4"
                  key={stop.id}
                >
                  <p className="flex items-center gap-3 font-semibold">
                    <Circle aria-hidden="true" size={14} />
                    {stop.title}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
        {content.moments.length === 0 && content.plannedStops.length === 0 ? (
          <p className="text-sm text-muted">{t('journey.emptyStage')}</p>
        ) : null}
      </div>
    </section>
  )
}

function MomentCard({ moment }: { moment: JourneyMoment }) {
  const { t } = useTranslation()
  const title = moment.entry.title ?? t('dashboard.untitled')

  return (
    <article className="overflow-hidden rounded-2xl border border-border/80 bg-background/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            {t(`entry.type.${moment.entry.type}`)}
          </p>
          <h4 className="mt-2 text-lg font-semibold">{title}</h4>
        </div>
        {moment.location === null ? null : (
          <span
            aria-label={t('journey.hasLocation')}
            className="rounded-full bg-primary/10 p-2 text-primary"
          >
            <MapPin aria-hidden="true" size={16} />
          </span>
        )}
      </div>
      {moment.entry.body === '' ? null : (
        <p className="mt-3 line-clamp-3 leading-7 text-muted">
          {moment.entry.body}
        </p>
      )}
      <PhotoGallery alt={title} entryId={moment.entry.id} />
      <Link
        className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline"
        params={{ entryId: moment.entry.id }}
        to="/e/$entryId"
      >
        {t('journey.openMoment')}
      </Link>
    </article>
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
