import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useFlowActions,
  useJourneyFlow,
} from '@/features/journey-flow/api/use-journey-flow'
import { SORTING_ROUTE } from '@/features/journey-flow/lib/flow-routes'
import { ReviewScreen } from '@/features/journey-flow/ui/ReviewScreen'
import { useJourneyWorkspace } from '@/features/journey-workspace/api/use-journey-workspace'
import { browserZone } from '@/features/journey-workspace/lib/format-range'
import { buildMoveStops } from '@/features/media-batch/model/move-sheet'
import { buttonVariants } from '@/shared/ui/button-variants'

/** Kontrola zastávek of one day, wired to the journey data and the actions. */
export function FlowDayPage({
  dayKey,
  journeyId,
}: {
  dayKey: string
  journeyId: string
}) {
  const { i18n, t } = useTranslation()
  const state = useJourneyFlow(journeyId)
  const workspace = useJourneyWorkspace(journeyId)
  const actions = useFlowActions(journeyId)
  const navigate = useNavigate()
  const tree = workspace.status === 'ready' ? workspace.tree : null
  const placeNames = state.status === 'ready' ? state.placeNames : null
  const moveStops = useMemo(
    () =>
      tree === null || placeNames === null
        ? []
        : buildMoveStops(tree, t, i18n.language, placeNames, browserZone()),
    [i18n.language, placeNames, t, tree],
  )
  const lookup = useMemo(
    () =>
      new Map(
        state.status === 'ready'
          ? state.flow.days.flatMap((day) => day.media).map((m) => [m.id, m])
          : [],
      ),
    [state],
  )

  if (state.status === 'loading') {
    return (
      <p aria-live="polite" role="status" className="text-sm text-muted">
        {t('flow.screen.review.loading')}
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-3" role="alert">
        <p>{t('flow.screen.review.loadError')}</p>
        <button
          className={buttonVariants({ variant: 'secondary' })}
          type="button"
          onClick={state.retry}
        >
          {t('common.tryAgain')}
        </button>
      </div>
    )
  }
  const day = state.flow.days.find((entry) => entry.key === dayKey)
  return (
    <div className="space-y-4">
      <Link
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        params={{ journeyId }}
        to="/j/$journeyId/flow"
      >
        {t('flow.screen.review.back')}
      </Link>
      {day === undefined ? (
        <p className="text-sm text-muted">
          {t('flow.screen.review.dayMissing')}
        </p>
      ) : (
        <ReviewScreen
          actions={actions}
          day={day}
          journeyId={journeyId}
          lookup={lookup}
          markers={state.markers}
          moveStops={moveStops}
          onContinue={(key) => {
            navigate({
              params: { dayKey: key, journeyId },
              to: SORTING_ROUTE,
            }).catch(() => undefined)
          }}
        />
      )}
    </div>
  )
}
