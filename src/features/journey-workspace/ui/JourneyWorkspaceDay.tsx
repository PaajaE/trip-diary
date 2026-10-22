import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDayNotes } from '@/entities/day-note/api/use-day-notes'
import {
  browserZone,
  formatDayHeading,
} from '@/features/journey-workspace/lib/format-range'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import { rememberVisitedDay } from '@/features/journey-workspace/lib/overview-scroll'
import { chapterTitle } from '@/features/journey-workspace/lib/chapter-labels'
import {
  dayNumber,
  UNKNOWN_DAY,
} from '@/features/journey-workspace/model/workspace-days'
import { formatDayCaption } from '@/features/journey-workspace/model/workspace-map'
import { buildOverview } from '@/features/journey-workspace/model/workspace-overview'
import {
  DayDetailPanel,
  useDayMediaActions,
} from '@/features/journey-workspace/ui/day'
import { MomentMenu } from '@/features/journey-workspace/ui/MomentMenu'
import { SessionViewer } from '@/features/journey-workspace/ui/SessionViewer'
import { useWorkspaceSession } from '@/features/journey-workspace/ui/workspace-session'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'

/**
 * The day page (`/j/$journeyId/workspace/day/$date`): a full-screen panel
 * over the app that scrolls inside itself, so the day panel's sticky top bar
 * and side map work on every screen. The day panel owns ←/→/Esc.
 */
export function JourneyWorkspaceDay({
  cull = false,
  date,
  journeyId,
}: {
  /** Open the day straight in culling ("Výběr nejlepších"). */
  cull?: boolean
  /** Local day key ("2026-06-03") or the "unknown" bucket. */
  date: string
  journeyId: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useWorkspaceSession(journeyId)
  const { canEdit, editing, locale, placeNames, state, tree } = session
  const actions = useDayMediaActions(journeyId)
  const notes = useDayNotes(journeyId)
  const noteDays = useMemo(() => new Set(notes.byDate.keys()), [notes.byDate])

  const overview = useMemo(
    () =>
      tree === null
        ? null
        : buildOverview(
            tree,
            (id) => placeNames.get(id),
            browserZone(),
            noteDays,
          ),
    [tree, placeNames, noteDays],
  )
  const keys = useMemo(() => overview?.days.map((d) => d.key) ?? [], [overview])
  const index = keys.indexOf(date)
  const day = index < 0 ? null : (overview?.days[index] ?? null)
  const previous = index > 0 ? (keys[index - 1] ?? null) : null
  const next = index >= 0 ? (keys[index + 1] ?? null) : null
  const chapter = overview?.chapters.find(
    (c) => c.id === overview.chapterOfDay.get(date),
  )

  useEffect(() => {
    rememberVisitedDay(journeyId, date)
  }, [date, journeyId])

  const goToDay = (target: string) => {
    void navigate({
      params: { date: target, journeyId },
      to: '/j/$journeyId/workspace/day/$date',
    })
  }
  const goToOverview = () => {
    void navigate({ params: { journeyId }, to: '/j/$journeyId/workspace' })
  }
  const setCull = (open: boolean) => {
    void navigate({
      params: { date, journeyId },
      replace: true,
      search: open ? { cull: true } : {},
      to: '/j/$journeyId/workspace/day/$date',
    })
  }

  let body: React.ReactNode = null
  const first = day?.moments[0]
  if (state.status === 'loading') {
    body = (
      <div
        aria-busy="true"
        className="animate-pulse space-y-3 p-5"
        data-testid="workspace-skeleton"
      >
        <div className="h-16 rounded-xl bg-surface" />
        <div className="h-16 rounded-xl bg-surface" />
      </div>
    )
  } else if (state.status === 'error') {
    body = (
      <div className="p-5" role="alert">
        <p>{t('workspace.loadError')}</p>
        <button
          className={cn(buttonVariants({ variant: 'secondary' }), 'mt-3')}
          type="button"
          onClick={state.retry}
        >
          {t('common.tryAgain')}
        </button>
      </div>
    )
  } else if (
    day === null ||
    first === undefined ||
    editing === null ||
    overview === null
  ) {
    body = (
      <div className="flex flex-col items-start gap-3 p-5">
        <p role="status">{t('workspace.dayNotFound')}</p>
        <button
          className={buttonVariants({ variant: 'secondary' })}
          type="button"
          onClick={goToOverview}
        >
          {t('workspace.backToOverview')}
        </button>
      </div>
    )
  } else {
    const dayLabel =
      date === UNKNOWN_DAY
        ? t('workspace.dayUnknown')
        : formatDayHeading(
            first.moment.startsAt,
            first.tz ?? browserZone(),
            locale,
          )
    body = (
      <DayDetailPanel
        actions={actions}
        baseUrl={BASE_URL}
        canEdit={canEdit}
        {...(chapter === undefined
          ? {}
          : { crumb: chapterTitle(chapter, t('workspace.looseMoments')) })}
        cull={{
          onOpenChange: setCull,
          open: cull,
          restoreMedia: (items) => session.edits.restoreMedia(items),
        }}
        dayKey={date}
        dayLabel={dayLabel}
        dayNumber={dayNumber(overview.firstDay, date)}
        days={(chapter?.days ?? []).map((d) => ({
          key: d.key,
          label:
            d.key === UNKNOWN_DAY
              ? t('workspace.dayUnknown')
              : (formatDayCaption(d.key, locale) ?? d.key),
        }))}
        edits={session.edits}
        journeyId={journeyId}
        locale={locale}
        moments={day.moments}
        placeNames={placeNames}
        renderStopMenu={(entry) => (
          <MomentMenu editing={editing} entry={entry} locale={locale} />
        )}
        shortcutsActive={session.viewer === null}
        onClose={goToOverview}
        onNext={
          next === null
            ? null
            : () => {
                goToDay(next)
              }
        }
        onOpenMedia={editing.openViewer}
        onPrev={
          previous === null
            ? null
            : () => {
                goToDay(previous)
              }
        }
        onSelectDay={goToDay}
      />
    )
  }

  return (
    <div
      aria-label={t('workspace.dayPage')}
      className="fixed inset-0 z-40 flex flex-col bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
      data-testid="day-panel"
      role="region"
    >
      {/* Status bar strip: the panel's sticky bar starts below the notch. */}
      <div className="h-[env(safe-area-inset-top)] shrink-0 bg-surface" />
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]"
        data-testid="day-scroller"
      >
        {body}
      </div>
      <SessionViewer session={session} />
    </div>
  )
}
