import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UndoOrganizeHandle } from '@/features/journey-organize/api/use-undo-organize'
import type { AutoOrganizeState } from '@/features/journey-organize/model/auto-organize'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'
import { buttonVariants } from '@/shared/ui/button-variants'

/** Result line of an undo ("... 2 věci zůstaly, jak jsou"). */
function resultText(
  t: ReturnType<typeof useTranslation>['t'],
  result: UndoOrganizeHandle['result'],
): string | null {
  if (result === null) return null
  if (result.kind === 'nothing') return t('flow.screen.intake.nothingToUndo')
  if (result.kind === 'failed') return t('flow.intake.undoFailed')
  return result.skipped.length > 0
    ? t('flow.intake.undoSkipped', { count: result.skipped.length })
    : t('flow.intake.undone')
}

/**
 * "Uspořádáno automaticky" with "Vrátit uspořádání" (confirm first), the
 * running state of the automatic run and its error with a retry.
 */
export function UndoBanner({
  auto,
  onRetry,
  undo,
}: {
  auto: AutoOrganizeState
  /** Starts the automatic run again after an error; omitted = no retry button. */
  onRetry?: () => void
  undo: UndoOrganizeHandle
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const result = resultText(t, undo.result)
  const failed = undo.result?.kind === 'failed'
  const running = auto.status === 'running' || auto.exclusive

  return (
    <section
      aria-label={t('flow.screen.intake.autoStatus')}
      className="space-y-2 rounded-xl border border-border bg-surface p-4"
    >
      {running ? (
        <p aria-live="polite" role="status" className="text-sm font-semibold">
          {undo.running ? t('flow.intake.undoing') : t('flow.auto.running')}
        </p>
      ) : null}
      {auto.status === 'error' ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm font-semibold text-destructive">
            {t('flow.auto.failed')}
          </p>
          {onRetry === undefined ? null : (
            <button
              className={buttonVariants({ variant: 'secondary' })}
              type="button"
              onClick={onRetry}
            >
              {t('flow.screen.intake.autoRetry')}
            </button>
          )}
        </div>
      ) : null}
      {auto.status === 'done' && auto.resolvingPlaces ? (
        <p aria-live="polite" role="status" className="text-sm text-muted">
          {t('flow.auto.resolvingPlaces')}
        </p>
      ) : null}
      {undo.available === true || result !== null ? (
        <>
          <h2 className="text-base font-semibold">
            {t('flow.intake.organizedTitle')}
          </h2>
          <p className="text-sm text-muted">{t('flow.intake.organizedBody')}</p>
          {result === null ? null : (
            <p
              aria-live="polite"
              className={failed ? 'text-sm text-destructive' : 'text-sm'}
              role={failed ? 'alert' : 'status'}
            >
              {result}
            </p>
          )}
          {undo.available === true ? (
            <button
              className={buttonVariants({ variant: 'secondary' })}
              disabled={undo.running}
              type="button"
              onClick={() => {
                setConfirming(true)
              }}
            >
              {t('flow.intake.undo')}
            </button>
          ) : null}
        </>
      ) : null}
      {confirming ? (
        <WorkspaceDialog
          title={t('flow.screen.intake.confirmUndoTitle')}
          onClose={() => {
            setConfirming(false)
          }}
        >
          <p className="mt-2 text-sm">
            {t('flow.screen.intake.confirmUndoBody')}
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              className={dialogButton}
              type="button"
              onClick={() => {
                setConfirming(false)
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              className={`${dialogButton} bg-primary text-primary-foreground`}
              type="button"
              onClick={() => {
                setConfirming(false)
                undo.undo().catch(() => undefined)
              }}
            >
              {t('flow.screen.intake.confirmUndo')}
            </button>
          </div>
        </WorkspaceDialog>
      ) : null}
    </section>
  )
}
