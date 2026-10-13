import type { OrganizationPlan } from '@trip-diary/core/automation'
import { isPlanEmpty } from '@trip-diary/core/automation'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import {
  applyOrganizationPlan,
  previewOrganization,
  type OrganizeProgress,
} from '@/features/journey-organize/api/organize-journey'
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

function OrganizeDialog({
  journeyId,
  onClose,
}: {
  journeyId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    previewOrganization(journeyId, {
      segmentTitle: ({ index, kind, tripType }) =>
        kind === 'stage' || tripType === null
          ? t('autoOrganize.stageTitle', { index })
          : t(`autoOrganize.tripTitle.${tripType}`, { index }),
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
  }, [journeyId, attempt, t])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }, [])

  const apply = useCallback(
    async (plan: OrganizationPlan) => {
      setState({ progress: null, status: 'applying' })
      const result = await applyOrganizationPlan(journeyId, plan, {
        onProgress: (progress) => {
          setState({ progress, status: 'applying' })
        },
      })
      // Even a partial run changed data, so always refresh the tree.
      await invalidateJourneyTree(queryClient, journeyId).catch(() => undefined)
      if (result.ok) {
        showToast({
          message: t('autoOrganize.done', {
            moments: result.counts.momentsCreated,
            suggestions:
              result.counts.stagesCreated + result.counts.tripsCreated,
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
    },
    [journeyId, onClose, queryClient, reload, showToast, t],
  )

  const busy = state.status === 'applying'
  return (
    <WorkspaceDialog title={t('autoOrganize.title')} onClose={onClose}>
      <p className="mt-2 text-sm">{t('autoOrganize.intro')}</p>
      <ul className="mt-2 list-disc pl-5 text-sm text-muted">
        <li>{t('autoOrganize.keepLocked')}</li>
        <li>{t('autoOrganize.keepRejected')}</li>
      </ul>
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
            className={`${dialogButton} bg-primary text-white`}
            type="button"
            onClick={() => {
              void apply(state.plan)
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
        className="min-h-10 rounded-md border border-border px-3 py-1.5 text-sm font-semibold"
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
