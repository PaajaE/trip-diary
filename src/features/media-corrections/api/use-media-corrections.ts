import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clearMediaLocation,
  setMediaLocation,
  shiftMediaTime,
} from '@/entities/media/api/media-corrections.repository'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import type { MediaItem } from '@/entities/media/model/media-library'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { organizeJourney } from '@/features/journey-organize/api/organize-journey'
import { organizeOptions } from '@/features/journey-organize/lib/organize-options'
import { useUndoableMutation } from '@/features/journey-workspace/lib/use-undoable-mutation'
import {
  shiftableCount,
  validateShift,
} from '@/features/media-corrections/model/fix-time'
import {
  planLocationUndo,
  snapshotLocations,
} from '@/features/media-corrections/model/location-undo'
import { useToast } from '@/shared/ui/use-toast'

export interface MediaCorrections {
  /**
   * Moves the capture time of the items by `deltaSeconds` (media without a
   * capture time are skipped by the RPC). With `reorganize`, the idempotent
   * organize step runs afterwards; it leaves locked and manual moments alone.
   * Undo is the inverse shift. Resolves true when the shift was saved.
   */
  shift: (
    items: readonly MediaItem[],
    deltaSeconds: number,
    options?: { reorganize?: boolean },
  ) => Promise<boolean>
  /** Sets the position of the items; Undo restores each previous position. */
  setLocation: (
    items: readonly MediaItem[],
    latitude: number,
    longitude: number,
  ) => Promise<boolean>
}

/**
 * Time and location corrections. The RPCs never regroup media into moments
 * (plan D2), so re-arranging is the separate organize step, opt-in.
 */
export function useMediaCorrections(journeyId: string): MediaCorrections {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const run = useUndoableMutation(journeyId, {
    undo: t('workspace.undo'),
    undoFailed: t('workspace.undoFailed'),
    undone: t('workspace.undone'),
  })

  return useMemo<MediaCorrections>(() => {
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: mediaQueryKeys.all })
    const language = i18n.language

    return {
      setLocation: (items, latitude, longitude) => {
        const ids = items.map((item) => item.id)
        const previous = snapshotLocations(items)
        return run({
          apply: () => setMediaLocation(ids, latitude, longitude),
          errorMessage: t('mediaCorrections.failed'),
          invalidate,
          successMessage: t('mediaCorrections.done', { count: ids.length }),
          undo: async () => {
            // Restores coordinates only; the RPC marks them 'manual'.
            for (const step of planLocationUndo(previous)) {
              if (step.kind === 'clear') await clearMediaLocation(step.ids)
              else
                await setMediaLocation(step.ids, step.latitude, step.longitude)
            }
          },
        })
      },
      shift: async (items, deltaSeconds, options) => {
        if (validateShift(deltaSeconds) !== 'ok') return false
        const ids = items.map((item) => item.id)
        const outcome = { organizeFailed: false }
        const saved = await run({
          apply: async () => {
            await shiftMediaTime(ids, deltaSeconds)
            if (options?.reorganize !== true) return
            // The shift is saved; a failing re-arrange must not roll it back.
            const result = await organizeJourney(
              journeyId,
              organizeOptions(t, language),
            ).catch(() => null)
            outcome.organizeFailed = result?.ok !== true
          },
          errorMessage: t('mediaCorrections.failed'),
          invalidate,
          successMessage: t('mediaCorrections.done', {
            count: shiftableCount(items),
          }),
          // Inverse shift; captured_at_source stays 'manual'.
          undo: () => shiftMediaTime(ids, -deltaSeconds),
        })
        if (saved && options?.reorganize === true) {
          await invalidateJourneyTree(queryClient, journeyId).catch(
            () => undefined,
          )
          if (outcome.organizeFailed) {
            showToast({
              message: t('mediaCorrections.organizeFailed'),
              variant: 'error',
            })
          }
        }
        return saved
      },
    }
  }, [i18n.language, journeyId, queryClient, run, showToast, t])
}
