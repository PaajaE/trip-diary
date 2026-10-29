import { useEffect, useMemo, useState } from 'react'
import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import {
  buildDaySort,
  type DaySortModel,
} from '@/features/journey-flow/model/day-sort'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import {
  buildSessionView,
  firstOpen,
  locate,
  nextOpen,
  type PhotoRef,
  type SessionPhoto,
  type SessionStop,
  type SessionView,
  type TrashedPhoto,
} from '@/features/journey-flow/model/sort-session'
import {
  revertOf,
  starOverrides,
  writeOf,
} from '@/features/journey-flow/ui/day-sort-writes'
import { useStopConfirm } from '@/features/journey-flow/ui/use-stop-confirm'
import {
  handledMap,
  outcomeOf,
  type SortAction,
  type SortOutcome,
} from '@/features/media-batch/model/quick-sort'
import {
  useSortHistory,
  type SortDraft,
} from '@/features/media-batch/ui/use-sort-history'
import { haptic } from '@/shared/lib/haptics'

export type DaySortActions = Pick<
  FlowActions,
  | 'finishStop'
  | 'restorePhotos'
  | 'sortPhotos'
  | 'starPhotos'
  | 'trashPhotos'
  | 'unconfirmStop'
>

/** How long "Zastávka 4 hotová" stays. */
export const STOP_DONE_MS = 2500

export interface DaySortState {
  /** Undo is available at once, also while the last step is saving. */
  canUndo: boolean
  current: { index: number; photo: SessionPhoto; stop: SessionStop } | null
  /** Every stop is done and nothing is left without a stop. */
  dayDone: boolean
  /** Writes failed: shown to the user, the step was taken back. */
  error: boolean
  model: DaySortModel
  /** Number of the stop just finished ("Zastávka 4 hotová"), null otherwise. */
  stopDone: number | null
  /** Every photo in the day's stops is decided (Konec dne opens). */
  stopsDone: boolean
  /** Ids trashed in this session (Konec dne counts them once). */
  trashedIds: ReadonlySet<string>
  view: SessionView
  /**
   * "★ Nejlepší": kept and starred in one step; on a photo already kept it
   * only turns ★ on or off.
   */
  best: (photoId?: string) => void
  clearError: () => void
  go: (photoId: string) => void
  keep: (photoId?: string) => void
  /** The photo leaves the stop (moved): go on to the next open one. */
  leave: (photoId: string) => void
  /** Moves on from the current photo without deciding it (-1 back). */
  skip: (delta: 1 | -1) => void
  /**
   * Série: keep these, trash those. A ★ photo is never trashed; at most two
   * Undo steps (the trash, then the keep).
   */
  settleSeries: (
    keepIds: readonly string[],
    trashIds: readonly string[],
  ) => void
  /** ★ as shown now, including a ★ still being saved. */
  starred: (photoId: string) => boolean
  /** ★ on or off without deciding anything (series and compare). */
  toggleStar: (photoId: string) => void
  trash: (photoId?: string) => void
  undo: () => void
}

function withOutcome(
  handled: ReadonlyMap<string, SortOutcome>,
  ids: readonly string[],
  type: SortDraft['type'],
): Map<string, SortOutcome> {
  const next = new Map(handled)
  const outcome = outcomeOf(type)
  if (outcome !== null) for (const id of ids) next.set(id, outcome)
  return next
}

function refOf(view: SessionView, photoId: string): PhotoRef | null {
  for (const stop of view.stops) {
    if (stop.photos.some((photo) => photo.item.id === photoId)) {
      return { photoId, stopId: stop.stop.id }
    }
  }
  return null
}

function firstRef(view: SessionView): PhotoRef | null {
  const stop = view.stops[0]
  const photo = stop?.photos[0]
  return stop === undefined || photo === undefined
    ? null
    : { photoId: photo.item.id, stopId: stop.stop.id }
}

/**
 * The per-day sorting loop: Koš · Nechat · ★ Nejlepší with automatic
 * advance, an Undo that never waits, and the stop confirmation once all its
 * photos are decided. Only `sortPhotos` marks photos as sorted.
 */
export function useDaySort(
  day: FlowDay,
  actions: DaySortActions,
): DaySortState {
  const model = useMemo(() => buildDaySort(day), [day])
  const steps = useSortHistory({ undoPending: true })
  const { handled, history } = steps
  const [trashed, setTrashed] = useState<TrashedPhoto[]>([])
  const view = useMemo(
    () => buildSessionView(model, handled, trashed),
    [handled, model, trashed],
  )
  const [ref, setRef] = useState<PhotoRef | null>(() => firstOpen(view))
  const [stopDone, setStopDone] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const confirm = useStopConfirm(model, view, history, actions, () => {
    setError(true)
  })

  // A photo that left the day (moved elsewhere) gives way to the next open one.
  const located = locate(view, ref)
  const current =
    located ?? locate(view, firstOpen(view)) ?? locate(view, firstRef(view))
  const stopsDone = view.allDone

  const overrides = useMemo(() => starOverrides(history), [history])
  const photoById = (id: string): SessionPhoto | undefined =>
    locate(view, refOf(view, id))?.photo
  const starred = (id: string) =>
    overrides.get(id) ?? photoById(id)?.item.starred ?? false

  useEffect(() => {
    if (stopDone === null) return
    const timer = window.setTimeout(() => {
      setStopDone(null)
    }, STOP_DONE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [stopDone])

  const rememberTrash = (ids: readonly string[]) => {
    const entries = ids.flatMap((id) => {
      const found = locate(view, refOf(view, id))
      return found === null
        ? []
        : [{ item: found.photo.item, stopId: found.stop.stop.id }]
    })
    const fresh = new Set(entries.map((entry) => entry.item.id))
    setTrashed((list) => [
      ...list.filter((entry) => !fresh.has(entry.item.id)),
      ...entries,
    ])
  }

  const record = (draft: SortDraft) => {
    steps.commit(draft, () => writeOf(draft, actions).then(() => true), {
      onFailed: () => {
        setError(true)
      },
    })
  }

  /** Records the steps and moves on from `from` past all of them. */
  const decide = (drafts: readonly SortDraft[], from: PhotoRef) => {
    const first = drafts[0]
    if (first === undefined) return
    haptic(first.type === 'trash' ? 'medium' : 'light')
    setError(false)
    let after = handled
    for (const draft of drafts) {
      if (draft.type === 'trash') rememberTrash(draft.ids)
      record(draft)
      after = withOutcome(after, draft.ids, draft.type)
    }
    if (drafts.every((d) => d.type === 'star' || d.type === 'unstar')) return
    const afterView = buildSessionView(model, after, trashed)
    const next = nextOpen(afterView, from)
    const left = afterView.stops.find((stop) => stop.stop.id === from.stopId)
    if (
      left?.done === true &&
      left.number !== null &&
      next?.stopId !== from.stopId
    ) {
      setStopDone(left.number)
    }
    setRef(next ?? from)
  }

  const target = (photoId?: string): PhotoRef | null => {
    const found =
      photoId === undefined ? current : locate(view, refOf(view, photoId))
    return found === null
      ? null
      : { photoId: found.photo.item.id, stopId: found.stop.stop.id }
  }
  const stateOf = (id: string) => photoById(id)?.state

  const keep = (photoId?: string) => {
    const ref = target(photoId)
    if (ref === null || stateOf(ref.photoId) !== 'open') return
    decide([{ ids: [ref.photoId], type: 'done' }], ref)
  }
  const trash = (photoId?: string) => {
    const ref = target(photoId)
    if (ref === null || stateOf(ref.photoId) === 'trash') return
    // A trashed photo is never a ★ pick: the ★ comes off in the same step.
    const draft: SortDraft = { ids: [ref.photoId], type: 'trash' }
    if (starred(ref.photoId)) draft.starred = true
    decide([draft], ref)
  }
  const toggleStar = (photoId: string) => {
    const ref = target(photoId)
    if (ref === null || stateOf(ref.photoId) === 'trash') return
    const type = starred(ref.photoId) ? 'unstar' : 'star'
    decide([{ ids: [ref.photoId], type }], ref)
  }
  const best = (photoId?: string) => {
    const ref = target(photoId)
    const state = ref === null ? undefined : stateOf(ref.photoId)
    if (ref === null || state === undefined || state === 'trash') return
    if (state === 'keep') {
      // Already decided: ★ only (on or off), the photo stays kept.
      toggleStar(ref.photoId)
      return
    }
    const draft: SortDraft = { ids: [ref.photoId], type: 'best' }
    if (!starred(ref.photoId)) draft.starred = true
    decide([draft], ref)
  }

  const settleSeries = (
    keepIds: readonly string[],
    trashIds: readonly string[],
  ) => {
    const keepNow = keepIds.filter((id) => stateOf(id) === 'open')
    // Never trash a ★ photo (also a ★ still saving) or one trashed already.
    const trashNow = trashIds.filter(
      (id) =>
        stateOf(id) !== undefined && stateOf(id) !== 'trash' && !starred(id),
    )
    const keepStarred = trashIds.filter(
      (id) => starred(id) && stateOf(id) === 'open',
    )
    const anchor = target(keepIds[0] ?? trashIds[0])
    if (anchor === null) return
    const drafts: SortDraft[] = []
    if (trashNow.length > 0) drafts.push({ ids: trashNow, type: 'trash' })
    const kept = [...keepNow, ...keepStarred]
    if (kept.length > 0) drafts.push({ ids: kept, type: 'done' })
    decide(drafts, anchor)
  }

  const undo = () => {
    const taken = steps.take()
    if (taken === null) return
    const { action } = taken
    haptic('light')
    setError(false)
    const first = action.ids[0]
    if (first !== undefined) {
      const found = locate(view, refOf(view, first))
      if (found !== null) setRef({ photoId: first, stopId: found.stop.stop.id })
    }
    // A stop this session confirmed is unlocked again when it is open again.
    const remaining = history.filter((h) => h.seq !== action.seq)
    confirm.reopen(buildSessionView(model, handledMap(remaining), trashed))
    taken.settled
      .then(async (saved) => {
        // A write that failed changed nothing: there is nothing to revert.
        if (saved) await revertOf(action, actions)
      })
      .catch(() => {
        steps.restore(settledCopy(action))
        setError(true)
      })
  }

  const leave = (photoId: string) => {
    const from = target(photoId)
    if (from === null) return
    const rest = buildSessionView(
      model,
      withOutcome(handled, [photoId], 'done'),
      trashed,
    )
    setRef(nextOpen(rest, from))
  }

  const go = (photoId: string) => {
    const found = locate(view, refOf(view, photoId))
    if (found !== null) setRef({ photoId, stopId: found.stop.stop.id })
  }
  const skip = (delta: 1 | -1) => {
    if (current === null) return
    const next = current.stop.photos[current.index + delta]
    if (next !== undefined) go(next.item.id)
  }

  return {
    best,
    canUndo: steps.canUndo,
    clearError: () => {
      setError(false)
    },
    current,
    dayDone: stopsDone && model.unassignedCount === 0,
    error,
    go,
    keep,
    leave,
    model,
    settleSeries,
    skip,
    starred,
    stopDone,
    stopsDone,
    toggleStar,
    trash,
    trashedIds: new Set(
      [...handled].flatMap(([id, outcome]) =>
        outcome === 'trash' ? [id] : [],
      ),
    ),
    undo,
    view,
  }
}

/** The step as saved (no `pending`), to put back after a failed Undo. */
function settledCopy(action: SortAction): SortAction {
  const copy = { ...action }
  delete copy.pending
  return copy
}
