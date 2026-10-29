import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import {
  buildDaySort,
  type DaySortModel,
} from '@/features/journey-flow/model/day-sort'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import {
  buildSessionView,
  firstOpen,
  liveStop,
  locate,
  nextOpen,
  sortedIds,
  type PhotoRef,
  type SessionPhoto,
  type SessionStop,
  type SessionView,
  type TrashedPhoto,
} from '@/features/journey-flow/model/sort-session'
import {
  outcomeOf,
  type SortOutcome,
} from '@/features/media-batch/model/quick-sort'
import {
  useSortHistory,
  type SortDraft,
} from '@/features/media-batch/ui/use-sort-history'
import { haptic } from '@/shared/lib/haptics'

export type DaySortActions = Pick<
  FlowActions,
  'finishStop' | 'restorePhotos' | 'sortPhotos' | 'starPhotos' | 'trashPhotos'
>

/** How long "Zastávka 4 hotová" stays. */
export const STOP_DONE_MS = 2500

export interface DaySortState {
  canUndo: boolean
  current: { index: number; photo: SessionPhoto; stop: SessionStop } | null
  /** Every photo of the day is decided (Konec dne). */
  dayDone: boolean
  /** Writes failed: shown to the user, the step was taken back. */
  error: boolean
  model: DaySortModel
  /** Number of the stop just finished ("Zastávka 4 hotová"), null otherwise. */
  stopDone: number | null
  /** Trashed in this session (Konec dne counts them). */
  trashedCount: number
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
  /** Moves on from the current photo without deciding it. */
  skip: (delta: 1 | -1) => void
  /** Ids of the series: keep these, trash those (two Undo steps). */
  settleSeries: (
    keepIds: readonly string[],
    trashIds: readonly string[],
  ) => void
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

/**
 * The per-day sorting loop: Koš · Nechat · ★ Nejlepší with automatic
 * advance, a real Undo and the stop confirmation once all its photos are
 * decided. Only `sortPhotos` marks photos as sorted; trash and ★ never do.
 */
export function useDaySort(
  day: FlowDay,
  actions: DaySortActions,
): DaySortState {
  const model = useMemo(() => buildDaySort(day), [day])
  const steps = useSortHistory()
  const { handled, history } = steps
  const [trashed, setTrashed] = useState<TrashedPhoto[]>([])
  const view = useMemo(
    () => buildSessionView(model, handled, trashed),
    [handled, model, trashed],
  )
  const [ref, setRef] = useState<PhotoRef | null>(() => firstOpen(view))
  const [stopDone, setStopDone] = useState<number | null>(null)
  const [error, setError] = useState(false)
  // Stops already done when the session starts were finished elsewhere:
  // only a stop finished here gets confirmed by it.
  const confirming = useRef<Set<string> | null>(null)
  confirming.current ??= new Set(
    view.stops.filter((stop) => stop.done).map((stop) => stop.stop.id),
  )

  // A photo that left the day (moved elsewhere) gives way to the next open one.
  const located = locate(view, ref)
  const fallback = located === null ? firstOpen(view) : null
  const current =
    located ?? locate(view, fallback) ?? locate(view, firstRef(view))
  const dayDone = view.totalStops > 0 && view.doneStops === view.totalStops

  const starOverride = useMemo(() => {
    const out = new Map<string, boolean>()
    for (const action of history) {
      for (const id of action.ids) {
        if (action.type === 'star') out.set(id, true)
        else if (action.type === 'unstar') out.set(id, false)
        else if (action.type === 'best' && action.starred === true)
          out.set(id, true)
      }
    }
    return out
  }, [history])
  const photoById = (id: string): SessionPhoto | undefined =>
    view.stops.flatMap((stop) => stop.photos).find((p) => p.item.id === id)
  const starred = (id: string) =>
    starOverride.get(id) ?? photoById(id)?.item.starred ?? false

  useEffect(() => {
    if (stopDone === null) return
    const timer = window.setTimeout(() => {
      setStopDone(null)
    }, STOP_DONE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [stopDone])

  // Finishing a stop's photos confirms (locks) it once its steps are saved.
  useEffect(() => {
    const pending = new Set(
      history.filter((a) => a.pending === true).flatMap((a) => a.ids),
    )
    const decided = sortedIds(view)
    const asked = confirming.current ?? new Set<string>()
    for (const stop of view.stops) {
      const id = stop.stop.id
      if (!stop.done || stop.stop.locked || asked.has(id)) continue
      if (stop.photos.some((photo) => pending.has(photo.item.id))) continue
      const live = liveStop(model, id)
      if (live === undefined) continue
      asked.add(id)
      actions.finishStop(live, decided).catch(() => {
        asked.delete(id)
        setError(true)
      })
    }
  }, [actions, history, model, view])

  const decide = (
    draft: SortDraft,
    request: () => Promise<unknown>,
    from: PhotoRef,
  ) => {
    haptic(draft.type === 'trash' ? 'medium' : 'light')
    setError(false)
    steps.commit(draft, () => request().then(() => true), {
      onFailed: () => {
        setError(true)
      },
    })
    if (draft.type === 'star' || draft.type === 'unstar') return
    const after = buildSessionView(
      model,
      withOutcome(handled, draft.ids, draft.type),
      trashed,
    )
    const next = nextOpen(after, from)
    const left = after.stops.find((stop) => stop.stop.id === from.stopId)
    if (left?.done === true && next?.stopId !== from.stopId) {
      setStopDone(left.number)
    }
    setRef(next ?? from)
  }

  const target = (photoId?: string): PhotoRef | null => {
    const ref =
      photoId === undefined ? current : locate(view, refOf(view, photoId))
    if (ref === null) return null
    return { photoId: ref.photo.item.id, stopId: ref.stop.stop.id }
  }
  const open = (photoId?: string): PhotoRef | null => {
    const ref = target(photoId)
    const photo = ref === null ? undefined : photoById(ref.photoId)
    return photo?.state === 'open' ? ref : null
  }

  const keep = (photoId?: string) => {
    const ref = open(photoId)
    if (ref === null) return
    const ids = [ref.photoId]
    decide({ ids, type: 'done' }, () => actions.sortPhotos(ids), ref)
  }
  const trash = (photoId?: string) => {
    const ref = target(photoId)
    const photo = ref === null ? undefined : photoById(ref.photoId)
    if (ref === null || photo === undefined || photo.state === 'trash') return
    const ids = [ref.photoId]
    setTrashed((list) => [
      ...list.filter((entry) => entry.item.id !== photo.item.id),
      { item: photo.item, stopId: ref.stopId },
    ])
    decide({ ids, type: 'trash' }, () => actions.trashPhotos(ids), ref)
  }
  const best = (photoId?: string) => {
    const ref = target(photoId)
    const photo = ref === null ? undefined : photoById(ref.photoId)
    if (ref === null || photo === undefined || photo.state === 'trash') return
    const ids = [ref.photoId]
    const isStarred = starred(ref.photoId)
    if (photo.state === 'keep') {
      // Already decided: ★ only (on or off), the photo stays kept.
      toggleStar(ref.photoId)
      return
    }
    decide(
      { ids, starred: !isStarred, type: 'best' },
      async () => {
        if (!isStarred) await actions.starPhotos(ids, true)
        await actions.sortPhotos(ids)
      },
      ref,
    )
  }

  const toggleStar = (photoId: string) => {
    const ref = target(photoId)
    const photo = ref === null ? undefined : photoById(ref.photoId)
    if (ref === null || photo === undefined || photo.state === 'trash') return
    const ids = [ref.photoId]
    const isStarred = starred(ref.photoId)
    decide(
      { ids, type: isStarred ? 'unstar' : 'star' },
      () => actions.starPhotos(ids, !isStarred),
      ref,
    )
  }

  const settleSeries = (
    keepIds: readonly string[],
    trashIds: readonly string[],
  ) => {
    const isOpen = (id: string) => photoById(id)?.state === 'open'
    const keepNow = keepIds.filter(isOpen)
    const trashNow = trashIds.filter((id) => photoById(id)?.state !== 'trash')
    const anchor = target(keepIds[0] ?? trashIds[0])
    if (anchor === null) return
    if (trashNow.length > 0) {
      setTrashed((list) => [
        ...list,
        ...trashNow.flatMap((id) => {
          const found = locate(view, refOf(view, id))
          return found === null
            ? []
            : [{ item: found.photo.item, stopId: found.stop.stop.id }]
        }),
      ])
      steps.commit({ ids: trashNow, type: 'trash' }, () =>
        actions.trashPhotos(trashNow).then(() => true),
      )
    }
    if (keepNow.length > 0) {
      decide(
        { ids: keepNow, type: 'done' },
        () => actions.sortPhotos(keepNow),
        anchor,
      )
    } else {
      setRef(
        nextOpen(
          buildSessionView(
            model,
            withOutcome(handled, trashNow, 'trash'),
            trashed,
          ),
          anchor,
        ) ?? anchor,
      )
    }
  }

  const undo = () => {
    const top = steps.top
    if (top === null) return
    haptic('light')
    steps.pop()
    setError(false)
    const first = top.ids[0]
    if (first !== undefined) {
      const found = locate(view, refOf(view, first))
      if (found !== null) {
        setRef({ photoId: first, stopId: found.stop.stop.id })
      }
    }
    const ids = [...top.ids]
    const revert = async () => {
      switch (top.type) {
        case 'trash':
          await actions.restorePhotos(ids)
          return
        case 'star':
        case 'unstar':
          await actions.starPhotos(ids, top.type === 'unstar')
          return
        case 'best':
          await actions.sortPhotos(ids, false)
          if (top.starred === true) await actions.starPhotos(ids, false)
          return
        case 'done':
        case 'moveTo':
        case 'newStop':
          await actions.sortPhotos(ids, false)
      }
    }
    revert().catch(() => {
      steps.restore(top)
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
    const photos = current.stop.photos
    const next = photos[current.index + delta]
    if (next !== undefined) go(next.item.id)
  }

  return {
    best,
    canUndo: steps.canUndo,
    clearError: () => {
      setError(false)
    },
    current,
    dayDone,
    error,
    go,
    keep,
    leave,
    model,
    settleSeries,
    skip,
    starred,
    stopDone,
    toggleStar,
    trash,
    trashedCount: [...handled.values()].filter((o) => o === 'trash').length,
    undo,
    view,
  }
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
