import { useTranslation } from 'react-i18next'
import type { NextStep } from '@/features/journey-workspace/model/workspace-tasks'

/**
 * "Next step": one thing to do, with a rough time and a way in. No list of
 * what is missing; when nothing waits, a quiet confirmation.
 */
export function NextStepCard({
  confidentCount = 0,
  onAcceptAll,
  onAcceptConfident,
  onStart,
  step,
}: {
  /** How many waiting suggestions are sure enough for "accept above 80 %". */
  confidentCount?: number
  /** Accepts the sure suggestions at once (each with its own Undo). */
  onAcceptConfident?: (() => void) | undefined
  /** Accepts every waiting suggestion at once (each with its own Undo). */
  onAcceptAll?: (() => void) | undefined
  onStart: (step: NextStep) => void
  step: NextStep | null
}) {
  const { t } = useTranslation()
  if (step === null) {
    return (
      <section
        aria-label={t('workspace.nextStep.label')}
        className="border-b border-border bg-primary-soft px-4 py-3 text-sm text-primary sm:px-5"
        data-testid="next-step-done"
      >
        {t('workspace.nextStep.allDone')}
      </section>
    )
  }
  return (
    <section
      aria-label={t('workspace.nextStep.label')}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-3 sm:px-5"
      data-testid="next-step"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {t('workspace.nextStep.label')}
        </p>
        <p className="text-base font-semibold text-foreground">
          {t(`workspace.nextStep.title.${step.id}`, { count: step.count })}
        </p>
        <p className="text-sm text-muted">
          {t('workspace.nextStep.estimate', { minutes: step.minutes })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {step.id === 'suggestions' &&
        onAcceptConfident !== undefined &&
        confidentCount > 0 ? (
          <button
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            data-testid="next-step-accept-confident"
            type="button"
            onClick={onAcceptConfident}
          >
            {t('workspace.nextStep.acceptConfident', { count: confidentCount })}
          </button>
        ) : null}
        {step.id === 'suggestions' && onAcceptAll !== undefined ? (
          <button
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground"
            data-testid="next-step-accept-all"
            type="button"
            onClick={onAcceptAll}
          >
            {t('workspace.nextStep.acceptAll')}
          </button>
        ) : null}
        <button
          className={
            step.id === 'suggestions' && onAcceptAll !== undefined
              ? 'inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground'
              : 'inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground'
          }
          type="button"
          onClick={() => {
            onStart(step)
          }}
        >
          {t('workspace.nextStep.start')}
        </button>
        <button
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted hover:text-foreground"
          data-testid="next-step-short"
          type="button"
          onClick={() => {
            onStart(step)
          }}
        >
          {t('workspace.nextStep.short', { minutes: step.shortMinutes })}
        </button>
      </div>
    </section>
  )
}
