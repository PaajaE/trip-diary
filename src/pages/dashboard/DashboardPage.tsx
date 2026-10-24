import { Link } from '@tanstack/react-router'
import { ArrowRight, MapPinned, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JourneyProgress } from '@/entities/dashboard/api/journey-progress.repository'
import { useDashboardQuery } from '@/entities/dashboard/api/use-dashboard-query'
import { useJourneyProgressQuery } from '@/entities/dashboard/api/use-journey-progress-query'
import { pickContinueJourney } from '@/entities/dashboard/lib/pick-continue-journey'
import type { DashboardJourneyCard } from '@/entities/dashboard/model/dashboard'
import { journeyMemberRoleLabels } from '@/entities/journey/model/journey-member'
import { useSession } from '@/features/auth/session'
import {
  DEFAULT_MEDIA_BASE_URL,
  getThumbUrl,
} from '@/features/journey-workspace/lib/media-thumb'
import { useActiveSpace } from '@/features/spaces/model/use-active-space'
import { buildPublicSpaceShare } from '@/features/sharing/lib/build-share-messages'
import { ShareIconButton } from '@/features/sharing/ui/ShareIconButton'
import { publicEnv } from '@/shared/config/env'
import { RevalidatingIndicator } from '@/shared/ui/RevalidatingIndicator'

const MEDIA_BASE_URL = publicEnv.mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL

export function DashboardPage() {
  const { t } = useTranslation()
  const { loading, profile, user } = useSession()
  const dashboardQuery = useDashboardQuery(user?.id)
  const spacesQuery = useActiveSpace(user?.id)
  // Pending (not yet synced) journeys do not exist on the server: no progress.
  const progressData = useJourneyProgressQuery(
    user?.id,
    (dashboardQuery.data?.journeys ?? [])
      .filter((journey) => journey.syncStatus === undefined)
      .map((journey) => journey.id),
  )
  const spaceShare =
    spacesQuery.activeSpace === null
      ? null
      : buildPublicSpaceShare(
          spacesQuery.activeSpace.handle,
          t('reader.shareSpaceMessage', {
            name: spacesQuery.activeSpace.name,
          }),
        )

  if (loading) {
    return <DashboardMessage>{t('dashboard.loading')}</DashboardMessage>
  }

  if (user === null) {
    return (
      <DashboardMessage>
        {t('dashboard.signInRequired')}{' '}
        <Link className="font-semibold text-primary" to="/sign-in">
          {t('home.signIn')}
        </Link>
      </DashboardMessage>
    )
  }

  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="flex flex-col justify-between gap-6 pb-10 sm:flex-row sm:items-end">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-accent uppercase">
            {t('dashboard.eyebrow')}
          </p>
          <h1 className="reader-display mt-3 text-4xl tracking-[-0.04em] sm:text-5xl">
            {t('dashboard.greeting', {
              name:
                profile?.displayName ??
                profile?.username ??
                user.email ??
                t('dashboard.traveler'),
            })}
          </h1>
          <RevalidatingIndicator
            label={t('dashboard.revalidating')}
            visible={dashboardQuery.isRevalidating}
          />
          <p className="mt-4 max-w-xl leading-7 text-muted">
            {t('dashboard.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {spaceShare !== null ? (
            <ShareIconButton
              shareText={spaceShare.shareText}
              shareUrl={spaceShare.shareUrl}
              title={spacesQuery.activeSpace?.name ?? t('brand')}
            />
          ) : null}
          <DashboardAction
            icon={MapPinned}
            label={t('dashboard.addJourney')}
            to="/journeys/new"
          />
        </div>
      </header>

      {dashboardQuery.isError ? (
        <p className="py-12 text-destructive" role="alert">
          {t('dashboard.error')}
        </p>
      ) : dashboardQuery.isLoading ? (
        <p className="py-12 text-muted">{t('dashboard.loading')}</p>
      ) : dashboardQuery.data === undefined ? (
        <p className="py-12 text-muted">{t('dashboard.loading')}</p>
      ) : (
        <>
          <ContinueTripHero
            journeys={dashboardQuery.data.journeys}
            progress={progressData?.progress}
          />
          <section className="py-12">
            <h2 className="flex items-center gap-3 text-2xl font-semibold">
              <MapPinned aria-hidden="true" size={22} />
              {t('dashboard.yourTrips')}
            </h2>
            {dashboardQuery.data.journeys.length === 0 ? (
              <p className="mt-6 max-w-xl leading-7 text-muted">
                {t('dashboard.noJourneys')}
              </p>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {dashboardQuery.data.journeys.map((journey) => (
                  <JourneyCard
                    cover={progressData?.covers.get(journey.id)}
                    journey={journey}
                    key={journey.id}
                    progress={progressData?.progress.get(journey.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}

export function JourneyCard({
  cover,
  journey,
  progress,
}: {
  cover: Parameters<typeof getThumbUrl>[0] | undefined
  journey: DashboardJourneyCard
  progress: JourneyProgress | undefined
}) {
  const { t } = useTranslation()
  const coverUrl =
    cover === undefined ? null : getThumbUrl(cover, MEDIA_BASE_URL)
  const toSort = progress?.mediaUnreviewed ?? 0
  return (
    <Link
      className="block overflow-hidden rounded-[1.25rem] border border-border/70 bg-surface shadow-soft transition-colors hover:bg-white"
      params={{ journeyId: journey.id }}
      search={{}}
      to="/j/$journeyId"
    >
      {coverUrl === null ? null : (
        <img
          alt=""
          className="aspect-[16/7] w-full object-cover"
          data-testid="journey-card-cover"
          loading="lazy"
          src={coverUrl}
        />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            {journey.syncStatus === undefined
              ? journey.role === 'owner'
                ? t(`journey.status.${journey.status}`)
                : journeyMemberRoleLabels[journey.role]
              : t('dashboard.pendingJourney')}
          </p>
          {toSort > 0 ? (
            <span
              className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white"
              data-testid="journey-card-to-sort"
            >
              {t('dashboard.card.toSort', { n: toSort })}
            </span>
          ) : null}
        </div>
        <h3 className="mt-2 text-lg font-semibold">{journey.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
          {journey.summary || t('dashboard.noSummary')}
        </p>
        {progress !== undefined && progress.daysTotal > 0 ? (
          <div
            aria-label={t('dashboard.card.progress', {
              done: progress.daysWithNote,
              total: progress.daysTotal,
            })}
            aria-valuemax={progress.daysTotal}
            aria-valuemin={0}
            aria-valuenow={progress.daysWithNote}
            className="mt-4 h-1 overflow-hidden rounded-full bg-border"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${String(Math.min(100, (progress.daysWithNote / progress.daysTotal) * 100))}%`,
              }}
            />
          </div>
        ) : null}
      </div>
    </Link>
  )
}

export function ContinueTripHero({
  journeys,
  progress,
}: {
  journeys: DashboardJourneyCard[]
  progress: ReadonlyMap<string, JourneyProgress> | undefined
}) {
  const { t } = useTranslation()
  const journey = pickContinueJourney(journeys)

  if (journey === null) {
    return null
  }

  const stats =
    journey.syncStatus === undefined ? progress?.get(journey.id) : undefined
  const unreviewed = stats?.mediaUnreviewed ?? 0
  const daysWithoutNote =
    stats === undefined ? 0 : Math.max(0, stats.daysTotal - stats.daysWithNote)
  const mode =
    unreviewed > 0 ? 'sort' : daysWithoutNote > 0 ? 'note' : 'continue'
  const primary =
    'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto'

  return (
    <section
      className="mt-10 rounded-[1.5rem] bg-primary/10 p-6 sm:p-8"
      data-mode={mode}
    >
      <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-accent uppercase">
        {mode === 'continue'
          ? t('dashboard.continueEyebrow')
          : t('dashboard.help.eyebrow')}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
        {mode === 'sort'
          ? t('dashboard.help.sortHeadline', { count: unreviewed })
          : mode === 'note'
            ? t('dashboard.help.noteHeadline')
            : journey.title}
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        {mode === 'sort'
          ? `${journey.title}. ${t('dashboard.help.sortDescription')}`
          : mode === 'note'
            ? `${journey.title}. ${t('dashboard.help.noteDescription', { count: daysWithoutNote })}`
            : journey.summary === ''
              ? t('dashboard.continueDescription')
              : journey.summary}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {mode === 'sort' ? (
          <Link
            className={primary}
            params={{ journeyId: journey.id }}
            to="/j/$journeyId/batch"
          >
            {t('dashboard.help.sortAction')}
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        ) : (
          <Link
            className={primary}
            params={{ journeyId: journey.id }}
            search={{}}
            to="/j/$journeyId"
          >
            {mode === 'note'
              ? t('dashboard.help.noteAction')
              : t('dashboard.continueTrip')}
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        )}
        <Link
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-semibold hover:bg-white sm:w-auto"
          params={{ journeyId: journey.id }}
          to="/j/$journeyId/quick"
        >
          <Plus aria-hidden="true" size={16} />
          {t('quickNote.title')}
        </Link>
      </div>
    </section>
  )
}

function DashboardMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-[calc(100svh-4rem)] max-w-5xl px-5 py-16 text-muted sm:px-8">
      {children}
    </main>
  )
}

interface DashboardActionProps {
  icon: typeof Plus
  label: string
  to: '/journeys/new'
}

function DashboardAction({ icon: Icon, label, to }: DashboardActionProps) {
  return (
    <Link
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      to={to}
    >
      <Icon aria-hidden="true" size={17} />
      {label}
    </Link>
  )
}
