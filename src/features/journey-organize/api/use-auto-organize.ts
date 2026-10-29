import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import {
  autoOrganizer,
  configureAutoOrganize,
} from '@/features/journey-organize/api/auto-organize'
import { organizeOptions } from '@/features/journey-organize/lib/organize-options'
import type {
  AutoOrganizeState,
  AutoOrganizer,
} from '@/features/journey-organize/model/auto-organize'
import {
  batchSettled,
  freshUploads,
  uploadedMediaIds,
  type TriggerSnapshot,
} from '@/features/journey-organize/model/upload-trigger'

/**
 * State of the automatic organisation of a journey (idle / running / done
 * with counts / error). Refreshes the journey tree once per finished run.
 */
export function useAutoOrganizeState(
  journeyId: string,
  organizer: AutoOrganizer = autoOrganizer,
): AutoOrganizeState {
  const queryClient = useQueryClient()
  const read = useCallback(
    () => organizer.getState(journeyId),
    [journeyId, organizer],
  )
  const state = useSyncExternalStore(organizer.subscribe, read, read)
  const seenSeq = useRef(0)
  const runSeq =
    state.status === 'done' || state.status === 'error' ? state.runSeq : 0
  const changed =
    (state.status === 'done' && !state.nothingNew) || state.status === 'error'
  useEffect(() => {
    if (runSeq === 0 || runSeq === seenSeq.current) return
    seenSeq.current = runSeq
    // Even a partial run changed data.
    if (changed) {
      void invalidateJourneyTree(queryClient, journeyId).catch(() => undefined)
    }
  }, [changed, journeyId, queryClient, runSeq])
  return state
}

/**
 * Hands the media of every finished upload batch to the automatic
 * organisation (debounced, single-flight per journey, see model). Uploads
 * that were already done when the screen opened are not handed over again:
 * a run always considers the whole journey, so the next batch covers them.
 */
export function useAutoOrganizeAfterUpload(
  journeyId: string,
  snapshot: TriggerSnapshot,
  organizer: AutoOrganizer = autoOrganizer,
): AutoOrganizeState {
  const { i18n, t } = useTranslation()
  useEffect(() => {
    if (organizer === autoOrganizer) {
      configureAutoOrganize(organizeOptions(t, i18n.language))
    }
  }, [i18n.language, organizer, t])

  const known = useRef<Set<string> | null>(null)
  // The jobs loaded from the device on open are history, not a new batch.
  const loaded = snapshot.jobs.length > 0 || snapshot.runtime !== 'idle'
  useEffect(() => {
    if (known.current === null) {
      if (!loaded) return
      known.current = new Set(uploadedMediaIds(snapshot.jobs))
      return
    }
    if (!batchSettled(snapshot)) return
    const fresh = freshUploads(snapshot, known.current)
    if (fresh.length === 0) return
    for (const id of fresh) known.current.add(id)
    organizer.request(journeyId, fresh)
  }, [journeyId, loaded, organizer, snapshot])

  return useAutoOrganizeState(journeyId, organizer)
}
