import { useEffect, useRef } from 'react'
import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import type { DaySortModel } from '@/features/journey-flow/model/day-sort'
import {
  liveStop,
  sortedIds,
  type SessionView,
} from '@/features/journey-flow/model/sort-session'
import type { SortHistory } from '@/features/media-batch/model/quick-sort'

export interface StopConfirm {
  /**
   * After an Undo: a stop this session confirmed that is no longer done
   * gets unlocked again (it was unlocked before the session locked it).
   */
  reopen: (view: SessionView) => void
}

/**
 * Finishing a stop's photos confirms (locks) it once the stop's steps are
 * saved. Stops already done when the session starts were finished
 * elsewhere and are left alone.
 */
export function useStopConfirm(
  model: DaySortModel,
  view: SessionView,
  history: SortHistory,
  actions: Pick<FlowActions, 'finishStop' | 'unconfirmStop'>,
  onError: () => void,
): StopConfirm {
  const asked = useRef<Set<string> | null>(null)
  asked.current ??= new Set(
    view.stops.filter((stop) => stop.done).map((stop) => stop.stop.id),
  )
  /** Stops this session locked (they were unlocked before). */
  const locked = useRef(new Set<string>())
  const latest = useRef({ actions, onError })
  useEffect(() => {
    latest.current = { actions, onError }
  })

  useEffect(() => {
    const pending = new Set(
      history.filter((a) => a.pending === true).flatMap((a) => a.ids),
    )
    const decided = sortedIds(view)
    const seen = asked.current ?? new Set<string>()
    for (const stop of view.stops) {
      const id = stop.stop.id
      if (!stop.done || stop.stop.locked || seen.has(id)) continue
      if (stop.photos.some((photo) => pending.has(photo.item.id))) continue
      const live = liveStop(model, id)
      if (live === undefined) continue
      seen.add(id)
      latest.current.actions.finishStop(live, decided).then(
        (confirmed) => {
          if (confirmed !== null) locked.current.add(confirmed)
        },
        () => {
          seen.delete(id)
          latest.current.onError()
        },
      )
    }
  }, [history, model, view])

  return {
    reopen: (after) => {
      for (const stop of after.stops) {
        const id = stop.stop.id
        if (stop.done || !locked.current.has(id)) continue
        locked.current.delete(id)
        asked.current?.delete(id)
        latest.current.actions.unconfirmStop(id).catch(() => {
          latest.current.onError()
        })
      }
    },
  }
}
