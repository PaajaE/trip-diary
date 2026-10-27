import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { useSession } from '@/features/auth/session'
import { updateFlowMarkers } from '@/features/journey-flow/api/flow-markers.store'
import { forgetRun } from '@/features/journey-flow/model/flow-markers'
import { autoOrganizer } from '@/features/journey-organize/api/auto-organize'
import {
  dexieSnapshotStore,
  type OrganizeSnapshotStore,
} from '@/features/journey-organize/api/organize-snapshot.store'
import {
  undoOrganization,
  type UndoResult,
} from '@/features/journey-organize/api/undo-organize'
import { useAutoOrganizeState } from '@/features/journey-organize/api/use-auto-organize'
import type { AutoOrganizer } from '@/features/journey-organize/model/auto-organize'

export interface UndoOrganizeHandle {
  /** A snapshot of the last run exists (null while it is being checked). */
  available: boolean | null
  /** Last result in this view, null before the first undo. */
  result: UndoResult | null
  running: boolean
  undo: () => Promise<UndoResult>
}

/**
 * "Vrátit uspořádání" for the banner of the Příjem screen. The undo runs as
 * an exclusive task of the organizer (it waits for a running organize and
 * no automatic run starts while it is active) and under the journey lock
 * (other tabs). Re-checks the snapshot after every run; refreshes the tree.
 */
export function useUndoOrganize(
  journeyId: string,
  store: OrganizeSnapshotStore = dexieSnapshotStore,
  organizer: AutoOrganizer = autoOrganizer,
): UndoOrganizeHandle {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const userId = user?.id ?? null
  const auto = useAutoOrganizeState(journeyId, organizer)
  const runSeq =
    auto.status === 'done' || auto.status === 'error' ? auto.runSeq : 0
  const [available, setAvailable] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<UndoResult | null>(null)
  const [check, setCheck] = useState(0)

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    store.get(userId, journeyId).then(
      (snapshot) => {
        if (!cancelled) setAvailable(snapshot !== null)
      },
      () => {
        if (!cancelled) setAvailable(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [check, journeyId, runSeq, store, userId])

  const undo = useCallback(async () => {
    setRunning(true)
    try {
      const outcome = await organizer.exclusive(journeyId, () =>
        undoOrganization(journeyId, {
          forgetRun: (owner, id, runId) => {
            updateFlowMarkers(owner, id, (markers) => forgetRun(markers, runId))
          },
          store,
        }),
      )
      setResult(outcome)
      if (outcome.kind !== 'nothing') {
        await invalidateJourneyTree(queryClient, journeyId).catch(
          () => undefined,
        )
      }
      return outcome
    } finally {
      setRunning(false)
      setCheck((value) => value + 1)
    }
  }, [journeyId, organizer, queryClient, store])

  // While a run or another exclusive task holds the journey the banner waits.
  const busy = running || auto.status === 'running' || auto.exclusive
  return {
    available: busy || userId === null ? false : available,
    result,
    running,
    undo,
  }
}
