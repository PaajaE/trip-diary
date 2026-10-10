import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { useToast } from '@/shared/ui/use-toast'

export interface UndoableEdit {
  /** Performs the change through a repository. */
  apply: () => Promise<unknown>
  errorMessage: string
  /** Extra cache keys to refresh besides the journey tree. */
  invalidate?: () => Promise<unknown>
  /**
   * Applies the change optimistically to the query cache and returns the
   * rollback. Called for both directions so Undo is optimistic too.
   */
  optimistic?: (direction: 'apply' | 'undo') => () => void
  successMessage: string
  /** Restores the previous value through the same repository call. */
  undo: () => Promise<unknown>
}

interface Labels {
  undo: string
  undoFailed: string
  undone: string
}

/**
 * Runs an edit with optimistic cache update, rollback + error toast on
 * failure, tree invalidation on success and a toast with an Undo action.
 * Resolves true when the edit was saved.
 */
export function useUndoableMutation(journeyId: string, labels: Labels) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useCallback(
    async (edit: UndoableEdit): Promise<boolean> => {
      const refresh = async () => {
        await Promise.all([
          invalidateJourneyTree(queryClient, journeyId),
          edit.invalidate?.(),
        ])
      }
      const rollback = edit.optimistic?.('apply')
      try {
        await edit.apply()
      } catch {
        rollback?.()
        showToast({ message: edit.errorMessage, variant: 'error' })
        return false
      }
      await refresh().catch(() => undefined)
      showToast({
        action: {
          label: labels.undo,
          onClick: () => {
            const undoRollback = edit.optimistic?.('undo')
            edit
              .undo()
              .then(() => {
                showToast({ message: labels.undone })
              })
              .catch(() => {
                undoRollback?.()
                showToast({ message: labels.undoFailed, variant: 'error' })
              })
              .then(refresh)
              .catch(() => undefined)
          },
        },
        duration: 6000,
        message: edit.successMessage,
      })
      return true
    },
    [
      journeyId,
      labels.undo,
      labels.undoFailed,
      labels.undone,
      queryClient,
      showToast,
    ],
  )
}
