import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createTip,
  deleteTip,
  updateTip,
} from '@/entities/tip/api/tip.repository'
import { tipQueryKeys } from '@/entities/tip/api/tip-query-keys'
import type { Tip, TipInput } from '@/entities/tip/model/tip'
import { useToast } from '@/shared/ui/use-toast'

export interface TipActions {
  create: (input: TipInput) => Promise<boolean>
  remove: (tip: Tip) => Promise<boolean>
  update: (tip: Tip, input: TipInput) => Promise<boolean>
}

/** Writes a tip, refreshes the list and reports the outcome in a toast. */
export function useTipActions(spaceId: string, authorId: string): TipActions {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMemo(() => {
    async function run(
      work: () => Promise<unknown>,
      success: string,
    ): Promise<boolean> {
      try {
        await work()
      } catch {
        showToast({ message: t('tips.saveFailed'), variant: 'error' })
        return false
      }
      await queryClient
        .invalidateQueries({ queryKey: tipQueryKeys.space(spaceId) })
        .catch(() => undefined)
      showToast({ message: success })
      return true
    }
    return {
      create: (input) =>
        run(() => createTip({ authorId, input, spaceId }), t('tips.created')),
      remove: (tip) => run(() => deleteTip(tip.id), t('tips.deleted')),
      update: (tip, input) =>
        run(() => updateTip(tip, input), t('tips.updated')),
    }
  }, [authorId, queryClient, showToast, spaceId, t])
}
