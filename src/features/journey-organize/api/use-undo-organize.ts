import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { updateFlowMarkers } from '@/features/journey-flow/api/flow-markers.store'
import { forgetRun } from '@/features/journey-flow/model/flow-markers'
import {
  dexieSnapshotStore,
  type OrganizeSnapshotStore,
} from '@/features/journey-organize/api/organize-snapshot.store'
import {
  undoOrganization,
  type UndoResult,
} from '@/features/journey-organize/api/undo-organize'
import { useAutoOrganizeState } from '@/features/journey-organize/api/use-auto-organize'

export interface UndoOrganizeHandle {
  /** A snapshot of the last run exists (null while it is being checked). */
  available: boolean | null
  /** Last result in this view, null before the first undo. */
  result: UndoResult | null
  running: boolean
  undo: () => Promise<UndoResult>
}

/**
 * "Vrátit uspořádání" for the banner of the Příjem screen. Re-checks the
 * snapshot after every automatic run; refreshes the journey tree after an
 * undo (also a partial one).
 */
export function useUndoOrganize(
  journeyId: string,
  store: OrganizeSnapshotStore = dexieSnapshotStore,
): UndoOrganizeHandle {
  const queryClient = useQueryClient()
  const auto = useAutoOrganizeState(journeyId)
  const runSeq =
    auto.status === 'done' || auto.status === 'error' ? auto.runSeq : 0
  const [available, setAvailable] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<UndoResult | null>(null)
  const [check, setCheck] = useState(0)

  useEffect(() => {
    let cancelled = false
    store.get(journeyId).then(
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
  }, [check, journeyId, runSeq, store])

  const undo = useCallback(async () => {
    setRunning(true)
    try {
      const outcome = await undoOrganization(journeyId, {
        forgetRun: (id, runId) => {
          updateFlowMarkers(id, (markers) => forgetRun(markers, runId))
        },
        store,
      })
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
  }, [journeyId, queryClient, store])

  // An undo while a run is active would race it: the banner waits.
  const busy = running || auto.status === 'running'
  return { available: busy ? false : available, result, running, undo }
}
