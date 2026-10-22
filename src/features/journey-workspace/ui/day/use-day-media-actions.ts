import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createMomentFromMedia,
  moveMedia,
} from '@/entities/media/api/media-trash.repository'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useUndoableMutation } from '@/features/journey-workspace/lib/use-undoable-mutation'

/** Media moves of the day detail that WorkspaceEdits does not offer. */
export interface DayMediaActions {
  /** Moves the media into an existing moment; Undo moves them back. */
  moveMedia: (
    items: readonly MediaItem[],
    targetMomentId: string,
  ) => Promise<boolean>
  /** Creates a new moment (stop) from the media. */
  createStop: (items: readonly MediaItem[]) => Promise<boolean>
}

export function useDayMediaActions(journeyId: string): DayMediaActions {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const run = useUndoableMutation(journeyId, {
    undo: t('workspace.undo'),
    undoFailed: t('workspace.undoFailed'),
    undone: t('workspace.undone'),
  })
  return useMemo<DayMediaActions>(
    () => ({
      createStop: (items) =>
        run({
          apply: () => createMomentFromMedia(items.map((item) => item.id)),
          errorMessage: t('dayDetail.stopCreateFailed'),
          successMessage: t('dayDetail.stopCreated'),
        }),
      moveMedia: (items, targetMomentId) => {
        const ids = items.map((item) => item.id)
        const origins = new Map<string, string[]>()
        let reversible = true
        for (const item of items) {
          if (item.momentId === null) {
            reversible = false
            continue
          }
          const list = origins.get(item.momentId) ?? []
          list.push(item.id)
          origins.set(item.momentId, list)
        }
        return run({
          apply: () => moveMedia(ids, targetMomentId),
          errorMessage: t('dayDetail.moveFailed'),
          successMessage: t('dayDetail.moved', { count: ids.length }),
          ...(reversible
            ? {
                undo: async () => {
                  for (const [momentId, group] of origins) {
                    await moveMedia(group, momentId)
                  }
                  await queryClient.invalidateQueries()
                },
              }
            : {}),
        })
      },
    }),
    [queryClient, run, t],
  )
}
