import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import type { FlowJourney } from '@/features/journey-flow/model/flow-days'
import {
  buildIntake,
  type IntakeDay,
} from '@/features/journey-flow/model/intake'
import type { FlowMarkers } from '@/features/journey-flow/model/flow-markers'
import { dayHeading, joinFacts } from '@/features/journey-flow/ui/flow-format'
import { UndoBanner } from '@/features/journey-flow/ui/UndoBanner'
import type { UndoOrganizeHandle } from '@/features/journey-organize/api/use-undo-organize'
import type { AutoOrganizeState } from '@/features/journey-organize/model/auto-organize'
import {
  BASE_URL,
  stopNameText,
} from '@/features/journey-workspace/lib/moment-labels'
import { getThumbUrl } from '@/features/journey-workspace/lib/media-thumb'
import { buttonVariants } from '@/shared/ui/button-variants'
import { cn } from '@/shared/lib/cn'

export interface IntakeScreenProps {
  auto: AutoOrganizeState
  flow: FlowJourney
  journeyId: string
  markers: FlowMarkers
  onRetryAuto?: () => void
  undo: UndoOrganizeHandle
}

type Actions = Pick<FlowActions, 'acknowledgeArrivals'>
export type IntakeActions = Actions

/**
 * Příjem: the newly arrived days with plain facts and "Projít den". Mobile is
 * a list, from `lg` the cards sit in two columns next to the banner. No
 * "sure day" badge: only how many stops deserve a look.
 */
export function IntakeScreen({
  auto,
  flow,
  journeyId,
  markers,
  onRetryAuto,
  undo,
}: IntakeScreenProps) {
  const { i18n, t } = useTranslation()
  const intake = useMemo(
    () => buildIntake(flow.days, markers),
    [flow.days, markers],
  )
  const { totals } = intake
  const photos = intake.days.reduce((sum, day) => sum + day.photoCount, 0)
  const summary = t('flow.intake.uploaded', {
    days: t('terms.day.count', { count: totals.days }),
    photos: t('terms.photo.count', { count: photos }),
  })
  const mediaById = useMemo(
    () => new Map(flow.days.flatMap((d) => d.media).map((m) => [m.id, m])),
    [flow.days],
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <header>
          <h2 className="text-xl font-semibold">{t('flow.intake.title')}</h2>
          {totals.days > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {summary}. {t('flow.intake.eachDay')} 1 {t('flow.intake.step1')},
              2 {t('flow.intake.step2')}.
            </p>
          ) : null}
          {totals.days > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {t('flow.intake.sureAndLook', {
                look: totals.lookStops,
                sure: totals.sureStops,
              })}
            </p>
          ) : null}
        </header>
        {intake.days.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            {t('flow.screen.intake.empty')}
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-1">
            {intake.days.map((day) => (
              <li className="min-w-0" key={day.key}>
                <IntakeDayCard
                  coverUrl={coverUrl(mediaById.get(day.coverMediaId ?? ''))}
                  day={day}
                  journeyId={journeyId}
                  locale={i18n.language}
                />
              </li>
            ))}
          </ul>
        )}
        {intake.unknownTime === null ? null : (
          <p className="text-sm text-muted">
            {t('flow.screen.intake.unknownTime', {
              count: intake.unknownTime.mediaCount,
            })}
          </p>
        )}
      </div>
      <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
        <UndoBanner
          auto={auto}
          undo={undo}
          {...(onRetryAuto === undefined ? {} : { onRetry: onRetryAuto })}
        />
      </aside>
    </div>
  )
}

function coverUrl(
  item: Parameters<typeof getThumbUrl>[0] | undefined,
): string | null {
  return item === undefined ? null : getThumbUrl(item, BASE_URL)
}

function IntakeDayCard({
  coverUrl: cover,
  day,
  journeyId,
  locale,
}: {
  coverUrl: string | null
  day: IntakeDay
  journeyId: string
  locale: string
}) {
  const { t } = useTranslation()
  const heading = dayHeading(day.key, locale)
  const names = day.places.map((name) => stopNameText(name, t, locale).text)
  const route =
    names.length === 2
      ? t('flow.intake.route', { from: names[0], to: names[1] })
      : (names[0] ?? null)
  const stops =
    day.tripCount > 0
      ? t('flow.intake.tripAndStops', { count: day.stopCount })
      : t('terms.moment.count', { count: day.stopCount })
  const facts = joinFacts([
    route,
    stops,
    t('terms.photo.count', { count: day.photoCount }),
  ])
  const look =
    day.needsLookCount > 0
      ? t('flow.intake.needsLook', { count: day.needsLookCount })
      : t('flow.intake.nothingNotable')
  const progress =
    day.sortedStops > 0
      ? t('flow.intake.progress', {
          done: day.sortedStops,
          total: day.stopCount,
        })
      : t('flow.intake.nothingDone')
  return (
    <article
      aria-label={heading}
      className="flex items-stretch gap-3 rounded-xl border border-border bg-background p-3"
    >
      <div
        aria-hidden="true"
        className={cn(
          'hidden size-20 shrink-0 rounded-lg bg-sunk bg-cover bg-center min-[400px]:block',
        )}
        style={
          cover === null ? undefined : { backgroundImage: `url("${cover}")` }
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-base font-semibold">{heading}</h3>
        <p className="text-sm text-muted">{facts}</p>
        <p
          className={cn(
            'text-sm font-medium',
            day.needsLookCount > 0 ? 'text-accent-strong' : 'text-muted',
          )}
        >
          {look}
        </p>
        <p className="text-xs text-muted">{progress}</p>
        <div className="mt-1">
          <Link
            aria-label={t('flow.screen.intake.openDayLabel', { day: heading })}
            className={buttonVariants({ variant: 'primary' })}
            params={{ dayKey: day.key, journeyId }}
            to="/j/$journeyId/flow/$dayKey"
          >
            {t('flow.intake.openDay')}
          </Link>
        </div>
      </div>
    </article>
  )
}
