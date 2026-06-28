import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen, MapPinned, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDashboardQuery } from '@/entities/dashboard/api/use-dashboard-query'
import { pickContinueJourney } from '@/entities/dashboard/lib/pick-continue-journey'
import type { DashboardJourneyCard } from '@/entities/dashboard/model/dashboard'
import { journeyMemberRoleLabels } from '@/entities/journey/model/journey-member'
import { useSession } from '@/features/auth/session'
import { RevalidatingIndicator } from '@/shared/ui/RevalidatingIndicator'

export function DashboardPage() {
  const { t } = useTranslation()
  const { loading, profile, user } = useSession()
  const dashboardQuery = useDashboardQuery(user?.id)

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
      <header className="flex flex-col justify-between gap-6 border-b border-border pb-10 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-accent">
            {t('dashboard.eyebrow')}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
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
        <div className="flex flex-col gap-3 sm:flex-row">
          <DashboardAction
            icon={MapPinned}
            label={t('dashboard.addJourney')}
            to="/journeys/new"
          />
          <DashboardAction
            icon={Plus}
            label={t('dashboard.addEntry')}
            to="/entries/new"
            variant="secondary"
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
          <ContinueTripHero journeys={dashboardQuery.data.journeys} />
          <div className="grid gap-12 py-12 lg:grid-cols-2">
            <DashboardSection
              empty={t('dashboard.noJourneys')}
              icon={MapPinned}
              title={t('dashboard.journeys')}
            >
              {dashboardQuery.data.journeys.map((journey) => (
                <Link
                  className="block rounded-md bg-surface p-5 shadow-soft transition-colors hover:bg-white"
                  key={journey.id}
                  params={{ journeyId: journey.id }}
                  to="/j/$journeyId"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {journey.syncStatus === undefined
                      ? journey.role === 'owner'
                        ? t(`journey.status.${journey.status}`)
                        : journeyMemberRoleLabels[journey.role]
                      : t('dashboard.pendingJourney')}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {journey.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
                    {journey.summary || t('dashboard.noSummary')}
                  </p>
                </Link>
              ))}
            </DashboardSection>
            <DashboardSection
              empty={t('dashboard.noEntries')}
              icon={BookOpen}
              title={t('dashboard.entries')}
            >
              {dashboardQuery.data.entries.map((entry) => (
                <Link
                  className="block rounded-md bg-surface p-5 shadow-soft transition-colors hover:bg-white"
                  key={entry.id}
                  params={{ entryId: entry.id }}
                  to="/e/$entryId"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {t(`entry.type.${entry.type}`)}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {entry.title ?? t('dashboard.untitled')}
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    {entry.status === 'published'
                      ? t('dashboard.published')
                      : t('dashboard.draft')}
                  </p>
                </Link>
              ))}
            </DashboardSection>
          </div>
        </>
      )}
    </main>
  )
}

function ContinueTripHero({ journeys }: { journeys: DashboardJourneyCard[] }) {
  const { t } = useTranslation()
  const journey = pickContinueJourney(journeys)

  if (journey === null) {
    return null
  }

  return (
    <section className="mt-10 rounded-[1.5rem] border border-border bg-surface p-6 shadow-soft sm:p-8">
      <p className="text-sm font-medium text-accent">
        {t('dashboard.continueEyebrow')}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
        {journey.title}
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        {journey.summary === ''
          ? t('dashboard.continueDescription')
          : journey.summary}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
          params={{ journeyId: journey.id }}
          to="/j/$journeyId"
        >
          {t('dashboard.continueTrip')}
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
        <Link
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-5 text-sm font-semibold hover:bg-white sm:w-auto"
          params={{ journeyId: journey.id }}
          to="/j/$journeyId/memory/new"
        >
          <Plus aria-hidden="true" size={16} />
          {t('journey.addMoment')}
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

interface DashboardSectionProps {
  children: React.ReactNode[]
  empty: string
  icon: typeof MapPinned
  title: string
}

function DashboardSection({
  children,
  empty,
  icon: Icon,
  title,
}: DashboardSectionProps) {
  return (
    <section>
      <h2 className="flex items-center gap-3 text-2xl font-semibold">
        <Icon aria-hidden="true" size={22} />
        {title}
      </h2>
      {children.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-border p-6 leading-7 text-muted">
          {empty}
        </p>
      ) : (
        <div className="mt-6 space-y-4">{children}</div>
      )}
    </section>
  )
}

interface DashboardActionProps {
  icon: typeof Plus
  label: string
  to: '/entries/new' | '/journeys/new'
  variant?: 'primary' | 'secondary'
}

function DashboardAction({
  icon: Icon,
  label,
  to,
  variant = 'primary',
}: DashboardActionProps) {
  return (
    <Link
      className={
        variant === 'primary'
          ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90'
          : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 text-sm font-semibold text-foreground hover:bg-white'
      }
      to={to}
    >
      <Icon aria-hidden="true" size={17} />
      {label}
    </Link>
  )
}
