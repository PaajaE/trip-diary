import type { OrganizationPlan } from '@trip-diary/core/automation'
import { isPlanEmpty } from '@trip-diary/core/automation'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { organizeNow } from '@/features/journey-organize/api/auto-organize'
import {
  previewOrganization,
  type OrganizeProgress,
} from '@/features/journey-organize/api/organize-journey'
import { organizeOptions } from '@/features/journey-organize/lib/organize-options'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'
import { useToast } from '@/shared/ui/use-toast'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { plan: OrganizationPlan; status: 'ready' }
  | { progress: OrganizeProgress | null; status: 'applying' }

function suggestionCount(plan: OrganizationPlan): number {
  return plan.stageSuggestions.length + plan.tripSuggestions.length
}

export function OrganizeDialog({
  journeyId,
  onClose,
}: {
  journeyId: string
  onClose: () => void
}) {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [fresh, setFresh] = useState(false)

  useEffect(() => {
    let cancelled = false
    previewOrganization(journeyId, {
      ...organizeOptions(t, i18n.language),
      forgetRejected: fresh,
    }).then(
      (plan) => {
        if (!cancelled) setState({ plan, status: 'ready' })
      },
      () => {
        if (!cancelled) setState({ status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [journeyId, attempt, fresh, t, i18n.language])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }, [])

  const apply = useCallback(async () => {
    setState({ progress: null, status: 'applying' })
    // The preview is only shown: the apply re-plans on the current state
    // (under the journey lock, with an undo snapshot), so a change made in
    // the meantime is never overwritten by an older plan.
    let outcome: Awaited<ReturnType<typeof organizeNow>>
    try {
      outcome = await organizeNow(journeyId, {
        ...organizeOptions(t, i18n.language),
        forgetRejected: fresh,
        onProgress: (progress) => {
          setState({ progress, status: 'applying' })
        },
      })
    } catch {
      await invalidateJourneyTree(queryClient, journeyId).catch(() => undefined)
      showToast({ message: t('autoOrganize.loadError'), variant: 'error' })
      reload()
      return
    }
    const { result } = outcome
    // Even a partial run changed data, so always refresh the tree.
    await invalidateJourneyTree(queryClient, journeyId).catch(() => undefined)
    if (result === null) {
      showToast({ message: t('autoOrganize.planNothing') })
      onClose()
      return
    }
    if (result.ok) {
      showToast({
        message: t('autoOrganize.done', {
          moments: result.counts.momentsCreated,
          suggestions: result.counts.stagesCreated + result.counts.tripsCreated,
        }),
      })
      onClose()
      return
    }
    showToast({
      message: t('autoOrganize.failed', {
        step: t(`autoOrganize.steps.${result.error.step}`),
      }),
      variant: 'error',
    })
    reload()
  }, [
    fresh,
    i18n.language,
    journeyId,
    onClose,
    queryClient,
    reload,
    showToast,
    t,
  ])

  const busy = state.status === 'applying'
  return (
    <WorkspaceDialog title={t('autoOrganize.title')} onClose={onClose}>
      <p className="mt-2 text-sm">{t('autoOrganize.intro')}</p>
      <ul className="mt-2 list-disc pl-5 text-sm text-muted">
        <li>{t('autoOrganize.keepLocked')}</li>
        <li>{t('autoOrganize.keepRejected')}</li>
      </ul>
      <div className="mt-3 flex items-start gap-2 text-sm">
        <input
          checked={fresh}
          className="mt-1"
          disabled={busy}
          id="organize-fresh"
          type="checkbox"
          onChange={(event) => {
            setFresh(event.target.checked)
            setState({ status: 'loading' })
          }}
        />
        <div>
          <label className="font-semibold" htmlFor="organize-fresh">
            {t('autoOrganize.fresh')}
          </label>
          <p className="text-muted">{t('autoOrganize.freshHint')}</p>
        </div>
      </div>
      <div aria-live="polite" className="mt-3 text-sm" role="status">
        {state.status === 'loading' ? t('autoOrganize.loading') : null}
        {state.status === 'error' ? (
          <span role="alert">{t('autoOrganize.loadError')}</span>
        ) : null}
        {state.status === 'ready' ? (
          isPlanEmpty(state.plan) ? (
            <p>{t('autoOrganize.planNothing')}</p>
          ) : (
            <>
              <p>
                {t('autoOrganize.planMoments', {
                  count: state.plan.momentsToCreate.length,
                })}
              </p>
              <p>
                {t('autoOrganize.planSuggestions', {
                  count: suggestionCount(state.plan),
                })}
              </p>
              <p>
                {t('autoOrganize.planChanges', {
                  deleted: state.plan.momentsToDelete.length,
                  moved: state.plan.mediaReassignments.length,
                  updated: state.plan.momentsToUpdate.length,
                })}
              </p>
              {fresh ? (
                <p>
                  {t('autoOrganize.planDiscarded', {
                    count: state.plan.segmentsToDelete.length,
                  })}
                </p>
              ) : null}
            </>
          )
        ) : null}
        {state.status === 'applying'
          ? t('autoOrganize.progress', {
              done: state.progress?.done ?? 0,
              total: state.progress?.total ?? 0,
            })
          : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          className={dialogButton}
          disabled={busy}
          type="button"
          onClick={onClose}
        >
          {t('common.cancel')}
        </button>
        {state.status === 'ready' && !isPlanEmpty(state.plan) ? (
          <button
            className={`${dialogButton} bg-primary text-primary-foreground`}
            type="button"
            onClick={() => {
              void apply()
            }}
          >
            {t('autoOrganize.apply')}
          </button>
        ) : null}
        {state.status === 'error' ? (
          <button className={dialogButton} type="button" onClick={reload}>
            {t('common.tryAgain')}
          </button>
        ) : null}
      </div>
    </WorkspaceDialog>
  )
}

/** Header button: opens a confirm dialog with a dry-run before changing anything. */
export function OrganizeJourneyButton({ journeyId }: { journeyId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => {
    setOpen(false)
  }, [])
  return (
    <>
      <button
        className="min-h-11 rounded-md border border-border px-3 py-1.5 text-sm font-semibold"
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('autoOrganize.button')}
      </button>
      {open ? <OrganizeDialog journeyId={journeyId} onClose={close} /> : null}
    </>
  )
}
