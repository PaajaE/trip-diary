import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BookOpen, MapPinned, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getDashboardData } from '@/entities/dashboard/api/dashboard.repository'
import { useSession } from '@/features/auth/session'

export function DashboardPage() {
  const { t } = useTranslation()
  const { loading, profile, user } = useSession()
  const dashboardQuery = useQuery({
    enabled: user !== null,
    queryFn: () => getDashboardData({ userId: user?.id ?? '' }),
    queryKey: ['dashboard', user?.id],
  })

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
      ) : dashboardQuery.data === undefined ? (
        <p className="py-12 text-muted">{t('dashboard.loading')}</p>
      ) : (
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
                  {t(`journey.status.${journey.status}`)}
                </p>
                <h3 className="mt-2 text-lg font-semibold">{journey.title}</h3>
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
      )}
    </main>
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
