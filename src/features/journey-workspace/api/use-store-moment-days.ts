import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'
import { storeMomentLocalDays } from '@/entities/moment/api/moment.repository'
import { browserZone } from '@/features/journey-workspace/lib/format-range'
import { useCanEditJourney } from '@/features/journey-workspace/api/use-can-edit-journey'
import {
  buildTreePhotoDays,
  dayOf,
} from '@/features/journey-workspace/model/workspace-days'
import {
  collectMoments,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

/** Moments whose stored day differs from the computed one (pure, for tests). */
export function momentDaysToStore(
  tree: WorkspaceTree,
  fallbackTz: string | null,
): { day: string; id: string }[] {
  const all = collectMoments(tree)
  const photoDays = buildTreePhotoDays(tree, fallbackTz)
  return all.flatMap((entry) => {
    const day = dayOf(entry, fallbackTz, photoDays)
    return day === null || entry.moment.localDay === day
      ? []
      : [{ day, id: entry.moment.id }]
  })
}

/**
 * Keeps `moments.local_day` in step with the day shown in the outline (the
 * database counts progress from it). Editors only, best effort: a failure
 * leaves the stored value as it was and is retried on the next load.
 */
export function useStoreMomentDays(
  journeyId: string,
  tree: WorkspaceTree | null,
): void {
  const { canEdit, ready } = useCanEditJourney(journeyId)
  const queryClient = useQueryClient()
  const lastSent = useRef('')
  useEffect(() => {
    if (tree === null || !ready || !canEdit) return
    const changes = momentDaysToStore(tree, browserZone())
    if (changes.length === 0) return
    const signature = JSON.stringify(changes)
    if (signature === lastSent.current) return
    lastSent.current = signature
    void (async () => {
      try {
        await storeMomentLocalDays(journeyId, changes)
        await queryClient.invalidateQueries({
          queryKey: momentQueryKeys.journey(journeyId),
        })
      } catch {
        // Best effort; the same change is tried again after the next load.
        lastSent.current = ''
      }
    })()
  }, [canEdit, journeyId, queryClient, ready, tree])
}
