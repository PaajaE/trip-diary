import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  CalendarDays,
  Circle,
  Images,
  Lightbulb,
  MapPin,
  Plus,
  Signpost,
  UsersRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  canContributeToJourney,
  getJourney,
  moveJourneyMomentToStage,
} from '@/entities/journey/api/journey.repository'
import {
  getMyJourneyRole,
  isJourneyOwner,
} from '@/entities/journey/api/journey-member.repository'
import { journeyMemberRoleLabels } from '@/entities/journey/model/journey-member'
import { useSession } from '@/features/auth/session'
import {
  composeJourneyContent,
  type JourneyMoment,
  type JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'
import { JourneyGuidesSection } from '@/features/journeys/ui/JourneyGuidesSection'
import { JourneyMap } from '@/features/journeys/ui/JourneyMap'
import { JourneyOrganizePanel } from '@/features/journeys/ui/JourneyOrganizePanel'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'
import { CopyShareLink } from '@/features/sharing'
import { shareUrl as sharePublicUrl } from '@/shared/lib/share'

interface JourneyPageProps {
  journeyId: string
  shareUrl?: string
}

export function JourneyPage({ journeyId, shareUrl }: JourneyPageProps) {
  const { t } = useTranslation()
  const { user } = useSession()
  const [guideFormOpen, setGuideFormOpen] = useState(false)
  const query = useQuery({
    queryFn: () => getJourney(journeyId),
    queryKey: ['journeys', journeyId],
  })
  const contributionQuery = useQuery({
    queryFn: () => canContributeToJourney(journeyId),
    queryKey: ['journey-contribution', journeyId],
  })
  const ownerQuery = useQuery({
    queryFn: () => isJourneyOwner(journeyId),
    queryKey: ['journey-owner', journeyId],
  })
  const myRoleQuery = useQuery({
    enabled: user !== null,
    queryFn: () => getMyJourneyRole(journeyId, user?.id ?? ''),
    queryKey: ['journey-my-role', journeyId, user?.id],
  })
  const journey = query.data
  const content =
    journey === null || journey === undefined
      ? null
      : composeJourneyContent(journey)
  const canEdit = contributionQuery.data === true
  const canManageMembers = ownerQuery.data === true

  useEffect(() => {
    if (!guideFormOpen) {
      return
    }
    document.getElementById('guides')?.scrollIntoView({ behavior: 'smooth' })
  }, [guideFormOpen])

  return (
    <main
      className={
        canEdit
          ? 'mx-auto min-h-svh w-full max-w-3xl px-5 py-8 pb-28 sm:py-16 sm:pb-16'
          : 'mx-auto min-h-svh w-full max-w-3xl px-5 py-8 sm:py-16'
      }
    >
      {query.isError ? (
        <p className="mt-16 text-destructive">{t('journey.error')}</p>
      ) : journey === undefined ? (
        <p className="mt-16 text-muted">{t('journey.loading')}</p>
      ) : journey === null ? (
        <p className="mt-16 text-muted">{t('journey.notFound')}</p>
      ) : (
        <>
          <header className="mt-10 overflow-hidden rounded-[2rem] border border-border bg-surface shadow-soft">
            <div className="bg-[radial-gradient(circle_at_top_left,_rgba(184,95,66,0.18),_transparent_36%),linear-gradient(135deg,_rgba(40,88,69,0.12),_rgba(255,253,248,0.8))] px-5 py-8 sm:px-8 sm:py-10">
              <p className="text-sm font-medium text-accent">
                {t(`journey.status.${journey.status}`)}
                {myRoleQuery.data === null ||
                myRoleQuery.data === undefined ? null : (
                  <>
                    {' · '}
                    {t('journey.yourRole', {
                      role: journeyMemberRoleLabels[myRoleQuery.data],
                    })}
                  </>
                )}
              </p>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-6xl">
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
              <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted">
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
              {canEdit || shareUrl !== undefined ? (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {canEdit ? (
                    <>
                      <Link
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
                        params={{ journeyId: journey.id }}
                        to="/j/$journeyId/memory/new"
                      >
                        <Plus aria-hidden="true" size={17} />
                        {t('journey.addMoment')}
                      </Link>
                      <button
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-white/80 px-5 text-sm font-semibold transition-colors hover:bg-white sm:w-auto"
                        onClick={() => {
                          setGuideFormOpen(true)
                        }}
                        type="button"
                      >
                        <Lightbulb aria-hidden="true" size={17} />
                        {t('journey.addGuide')}
                      </button>
                      {canManageMembers ? (
                        <Link
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-white/80 px-5 text-sm font-semibold transition-colors hover:bg-white sm:w-auto"
                          params={{ journeyId: journey.id }}
                          to="/j/$journeyId/members"
                        >
                          <UsersRound aria-hidden="true" size={17} />
                          {t('journey.manageMembers')}
                        </Link>
                      ) : null}
                    </>
                  ) : null}
                  {shareUrl === undefined ? null : (
                    <CopyShareLink
                      className="bg-white/80 sm:min-h-12"
                      onCopy={() => sharePublicUrl(shareUrl, journey.title)}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </header>

          <nav
            aria-label={t('journey.explore')}
            className="sticky top-[calc(4rem-0.25rem)] z-10 mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-soft backdrop-blur sm:top-3 sm:grid-cols-4"
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
            <JourneyNavLink
              href="#guides"
              icon={Lightbulb}
              label={t('journey.guides')}
            />
          </nav>

          <section className="scroll-mt-28 py-12 sm:scroll-mt-24" id="story">
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
                    canEdit={canEdit}
                    content={stageContent}
                    journey={journey}
                    key={stageContent.stage?.id ?? 'unassigned'}
                    onChanged={() => void query.refetch()}
                  />
                ))}
              </div>
            )}

            {canEdit ? (
              <JourneyOrganizePanel
                journey={journey}
                onChanged={() => {
                  void query.refetch()
                }}
              />
            ) : null}
          </section>

          <section className="scroll-mt-28 py-12 sm:scroll-mt-24" id="map">
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

          <section className="scroll-mt-28 py-12 sm:scroll-mt-24" id="gallery">
            <SectionHeading
              eyebrow={t('journey.galleryEyebrow')}
              title={t('journey.gallery')}
            />
            <JourneyGallery moments={content?.moments ?? []} />
          </section>

          <JourneyGuidesSection
            canEdit={canEdit}
            journey={journey}
            onChanged={() => {
              setGuideFormOpen(false)
              void query.refetch()
            }}
            showAddForm={guideFormOpen}
          />

          {canEdit ? (
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur sm:hidden pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Link
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
                params={{ journeyId: journey.id }}
                to="/j/$journeyId/memory/new"
              >
                <Plus aria-hidden="true" size={17} />
                {t('journey.addMoment')}
              </Link>
            </div>
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
      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-colors hover:bg-background sm:gap-2"
      href={href}
    >
      <Icon aria-hidden="true" size={16} />
      <span className="truncate">{label}</span>
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

function StageContent({
  canEdit,
  content,
  journey,
  onChanged,
}: {
  canEdit: boolean
  content: JourneyStageContent
  journey: NonNullable<Awaited<ReturnType<typeof getJourney>>>
  onChanged: () => void
}) {
  const { t } = useTranslation()

  return (
    <section className="rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft sm:p-6">
      <h3 className="flex items-center gap-3 text-xl font-semibold">
        <Signpost aria-hidden="true" size={18} />
        {content.stage?.title ?? t('journey.freeMoments')}
      </h3>
      <div className="mt-6 space-y-4">
        {content.moments.map((moment) => (
          <MomentCard
            canEdit={canEdit}
            journey={journey}
            key={moment.entry.id}
            moment={moment}
            onChanged={onChanged}
          />
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

function MomentCard({
  canEdit,
  journey,
  moment,
  onChanged,
}: {
  canEdit: boolean
  journey: NonNullable<Awaited<ReturnType<typeof getJourney>>>
  moment: JourneyMoment
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const title = moment.entry.title ?? t('dashboard.untitled')
  const [moving, setMoving] = useState(false)
  const [moveFailed, setMoveFailed] = useState(false)

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
      {!canEdit || journey.stages.length === 0 ? null : (
        <label className="mt-5 block text-sm font-medium text-muted">
          {t('journey.organizeMoment')}
          <select
            className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground"
            disabled={moving}
            onChange={(event) => {
              setMoveFailed(false)
              setMoving(true)
              void moveJourneyMomentToStage({
                entryId: moment.entry.id,
                journeyId: journey.id,
                stageId: event.currentTarget.value || null,
                stopId: moment.entry.stopId,
              })
                .then(onChanged)
                .catch(() => {
                  setMoveFailed(true)
                })
                .finally(() => {
                  setMoving(false)
                })
            }}
            value={moment.entry.stageId ?? ''}
          >
            <option value="">{t('journey.noStage')}</option>
            {journey.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
          {moveFailed ? (
            <span className="mt-2 block text-sm text-destructive" role="alert">
              {t('journey.organizeMomentError')}
            </span>
          ) : null}
        </label>
      )}
      <Link
        className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
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
      <Link
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
        params={{ journeyId }}
        to="/j/$journeyId/memory/new"
      >
        <Plus aria-hidden="true" size={18} />
        {t('journey.addMoment')}
      </Link>
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
