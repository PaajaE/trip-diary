import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { detachMediaFromMoment } from '@/entities/media/api/media-library.repository'
import { markMediaReviewed } from '@/entities/media/api/media-review.repository'
import {
  createMomentFromMedia,
  moveMedia,
} from '@/entities/media/api/media-trash.repository'
import { deleteMomentWithMedia } from '@/entities/moment/api/moment.repository'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useUndoableMutation } from '@/features/journey-workspace/lib/use-undoable-mutation'

export interface MediaActionOptions {
  /**
   * Also marks the media as sorted (batch inbox). Undo then restores the
   * previous moments in every case, including media that had none, and marks
   * the media as waiting again.
   */
  reviewed?: boolean
}

/** Media moves of the day detail that WorkspaceEdits does not offer. */
export interface DayMediaActions {
  /** Moves the media into an existing moment; Undo moves them back. */
  moveMedia: (
    items: readonly MediaItem[],
    targetMomentId: string,
    options?: MediaActionOptions,
  ) => Promise<boolean>
  /** Creates a new moment (stop) from the media. */
  createStop: (
    items: readonly MediaItem[],
    options?: MediaActionOptions,
  ) => Promise<boolean>
}

/** Media grouped by the moment they were in; null key = no moment. */
function groupByOrigin(
  items: readonly MediaItem[],
): Map<string | null, string[]> {
  const origins = new Map<string | null, string[]>()
  for (const item of items) {
    const list = origins.get(item.momentId) ?? []
    list.push(item.id)
    origins.set(item.momentId, list)
  }
  return origins
}

/** Puts media back where they were (moment or no moment). */
async function restoreOrigins(
  origins: ReadonlyMap<string | null, string[]>,
): Promise<void> {
  for (const [momentId, group] of origins) {
    if (momentId === null) await detachMediaFromMoment(group)
    else await moveMedia(group, momentId)
  }
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
      createStop: (items, options) => {
        const ids = items.map((item) => item.id)
        const reviewed = options?.reviewed === true
        const origins = groupByOrigin(items)
        let createdId: string | null = null
        return run({
          apply: async () => {
            createdId = await createMomentFromMedia(ids)
            if (reviewed) await markMediaReviewed(ids)
          },
          errorMessage: t('dayDetail.stopCreateFailed'),
          successMessage: t('dayDetail.stopCreated'),
          ...(reviewed
            ? {
                undo: async () => {
                  await restoreOrigins(origins)
                  if (createdId !== null) {
                    // Empty by now, so no neighbour is needed.
                    await deleteMomentWithMedia(createdId, 'keep_media')
                  }
                  await markMediaReviewed(ids, false)
                  await queryClient.invalidateQueries()
                },
              }
            : {}),
        })
      },
      moveMedia: (items, targetMomentId, options) => {
        const ids = items.map((item) => item.id)
        if (options?.reviewed === true) {
          const origins = groupByOrigin(items)
          return run({
            apply: async () => {
              await moveMedia(ids, targetMomentId)
              await markMediaReviewed(ids)
            },
            errorMessage: t('dayDetail.moveFailed'),
            successMessage: t('dayDetail.moved', { count: ids.length }),
            undo: async () => {
              await restoreOrigins(origins)
              await markMediaReviewed(ids, false)
              await queryClient.invalidateQueries()
            },
          })
        }
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
