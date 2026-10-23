import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import { markMediaReviewed } from '@/entities/media/api/media-review.repository'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  useWorkspaceEdits,
  type WorkspaceEdits,
} from '@/features/journey-workspace/api/use-workspace-edits'
import { useUndoableMutation } from '@/features/journey-workspace/lib/use-undoable-mutation'
import { useDayMediaActions } from '@/features/journey-workspace/ui/day/use-day-media-actions'

export interface BatchActions {
  /** "Hotovo": marks the media as sorted; Undo marks them as waiting again. */
  done: (items: readonly MediaItem[]) => Promise<boolean>
  edits: WorkspaceEdits
  /** Moves into a moment and marks as sorted. */
  moveTo: (items: readonly MediaItem[], momentId: string) => Promise<boolean>
  /** New stop from the media, marked as sorted. */
  newStop: (items: readonly MediaItem[]) => Promise<boolean>
  /**
   * ★ on the selection: stars all, or unstars when all are starred. Does not
   * mark anything as sorted.
   */
  star: (items: readonly MediaItem[]) => Promise<void>
  /**
   * Trashes the media. Sorted-ness needs no write: trashed rows leave the
   * inbox on their own and a restore puts them back to waiting.
   */
  trash: (items: readonly MediaItem[]) => Promise<boolean>
}

/**
 * Actions of the batch inbox. Every one that sorts media removes their tiles
 * at once (optimistic) and shows a toast with Undo; a failure puts the tiles
 * back.
 */
export function useBatchActions(journeyId: string): BatchActions {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const edits = useWorkspaceEdits(journeyId)
  const dayActions = useDayMediaActions(journeyId)
  const run = useUndoableMutation(journeyId, {
    undo: t('workspace.undo'),
    undoFailed: t('workspace.undoFailed'),
    undone: t('workspace.undone'),
  })

  return useMemo<BatchActions>(() => {
    const key = mediaQueryKeys.unreviewed(journeyId)

    /** Hides tiles right away; the returned function brings them back. */
    function hide(items: readonly MediaItem[]): () => void {
      const previous = queryClient.getQueryData<MediaItem[]>(key)
      if (previous === undefined) return () => undefined
      const gone = new Set(items.map((item) => item.id))
      queryClient.setQueryData<MediaItem[]>(
        key,
        previous.filter((item) => !gone.has(item.id)),
      )
      return () => {
        queryClient.setQueryData<MediaItem[]>(key, previous)
      }
    }

    async function sorted(
      items: readonly MediaItem[],
      action: () => Promise<boolean>,
    ): Promise<boolean> {
      const show = hide(items)
      const ok = await action()
      if (!ok) show()
      return ok
    }

    return {
      done: (items) => {
        const ids = items.map((item) => item.id)
        return sorted(items, () =>
          run({
            apply: () => markMediaReviewed(ids),
            errorMessage: t('mediaBatch.doneFailed'),
            successMessage: t('mediaBatch.doneToast', { count: ids.length }),
            undo: () => markMediaReviewed(ids, false),
          }),
        )
      },
      edits,
      moveTo: (items, momentId) =>
        sorted(items, () =>
          dayActions.moveMedia(items, momentId, { reviewed: true }),
        ),
      newStop: (items) =>
        sorted(items, () => dayActions.createStop(items, { reviewed: true })),
      star: async (items) => {
        const next = !items.every((item) => item.starred)
        const changing = items.filter((item) => item.starred !== next)
        // Show the star at once; the tree refresh confirms it.
        const previous = queryClient.getQueryData<MediaItem[]>(key)
        if (previous !== undefined) {
          const ids = new Set(changing.map((item) => item.id))
          queryClient.setQueryData<MediaItem[]>(
            key,
            previous.map((item) =>
              ids.has(item.id) ? { ...item, starred: next } : item,
            ),
          )
        }
        const results = await Promise.all(
          changing.map((item) => edits.toggleStar(item)),
        )
        if (previous !== undefined && results.includes(false)) {
          void queryClient.invalidateQueries({ queryKey: key })
        }
      },
      trash: (items) => sorted(items, () => edits.trashMedia(items)),
    }
  }, [dayActions, edits, journeyId, queryClient, run, t])
}
