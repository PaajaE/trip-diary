import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useJourneyFlow } from '@/features/journey-flow/api/use-journey-flow'
import { IntakeScreen } from '@/features/journey-flow/ui/IntakeScreen'
import {
  autoOrganizer,
  configureAutoOrganize,
} from '@/features/journey-organize/api/auto-organize'
import { useAutoOrganizeState } from '@/features/journey-organize/api/use-auto-organize'
import { useUndoOrganize } from '@/features/journey-organize/api/use-undo-organize'
import { organizeOptions } from '@/features/journey-organize/lib/organize-options'
import { buttonVariants } from '@/shared/ui/button-variants'

/** Příjem wired to the journey data, the auto-organize state and the undo. */
export function FlowIntakePage({ journeyId }: { journeyId: string }) {
  const { i18n, t } = useTranslation()
  const state = useJourneyFlow(journeyId)
  const auto = useAutoOrganizeState(journeyId)
  const undo = useUndoOrganize(journeyId)
  // Same options as after an upload, so a retry from here organises alike.
  useEffect(() => {
    configureAutoOrganize(organizeOptions(t, i18n.language))
  }, [i18n.language, t])
  const mediaIds = useMemo(
    () =>
      state.status === 'ready'
        ? state.flow.days.flatMap((day) => day.media.map((item) => item.id))
        : [],
    [state],
  )

  if (state.status === 'loading') {
    return (
      <p aria-live="polite" role="status" className="text-sm text-muted">
        {t('flow.screen.intake.loading')}
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-3" role="alert">
        <p>{t('flow.screen.intake.loadError')}</p>
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
  return (
    <IntakeScreen
      auto={auto}
      flow={state.flow}
      journeyId={journeyId}
      markers={state.markers}
      undo={undo}
      onRetryAuto={() => {
        autoOrganizer.request(journeyId, mediaIds)
      }}
    />
  )
}
