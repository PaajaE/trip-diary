import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useFlowActions,
  useJourneyFlow,
} from '@/features/journey-flow/api/use-journey-flow'
import { REVIEW_ROUTE } from '@/features/journey-flow/lib/flow-routes'
import { SortScreen } from '@/features/journey-flow/ui/sort/SortScreen'
import { useJourneyWorkspace } from '@/features/journey-workspace/api/use-journey-workspace'
import { browserZone } from '@/features/journey-workspace/lib/format-range'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import { buildMoveStops } from '@/features/media-batch/model/move-sheet'
import { buttonVariants } from '@/shared/ui/button-variants'

/** Třídění of one day (step 2 of 2), wired to the journey data and actions. */
export function FlowSortPage({
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

  if (state.status === 'loading') {
    return (
      <p aria-live="polite" role="status" className="text-sm text-muted">
        {t('flow.sort.loading')}
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
  if (day === undefined) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {t('flow.screen.review.dayMissing')}
        </p>
        <Link
          className={buttonVariants({ variant: 'secondary' })}
          params={{ journeyId }}
          to="/j/$journeyId/flow"
        >
          {t('flow.screen.review.back')}
        </Link>
      </div>
    )
  }
  return (
    <SortScreen
      // A new day starts a new session (Undo stack, position).
      key={day.key}
      actions={actions}
      baseUrl={BASE_URL}
      day={day}
      days={state.flow.days}
      journeyId={journeyId}
      moveStops={moveStops}
      onOpenReview={() => {
        navigate({
          params: { dayKey, journeyId },
          replace: true,
          to: REVIEW_ROUTE,
        }).catch(() => undefined)
      }}
    />
  )
}
