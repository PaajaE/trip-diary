import { suggestStop } from '@trip-diary/core/automation'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { browserZone } from '@/features/journey-workspace/lib/format-range'
import type { WorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import type { BatchActions } from '@/features/media-batch/api/use-batch-actions'
import { buildMoveStops } from '@/features/media-batch/model/move-sheet'
import {
  markStarHintSeen,
  starHintSeen,
} from '@/features/media-batch/model/star-hint'
import {
  advanceOpen,
  buildSession,
  comparePool,
  lastSortedDay,
  openSeries,
  outcomeOf,
  skipTarget,
  stepOpen,
  summarize,
  type SortAction,
} from '@/features/media-batch/model/quick-sort'
import { usePhotoCompare } from '@/features/media-batch/ui/use-photo-compare'
import {
  useSortHistory,
  type SortDraft,
} from '@/features/media-batch/ui/use-sort-history'
import { haptic, type HapticKind } from '@/shared/lib/haptics'

export type QuickSortOverlay = 'none' | 'change' | 'series' | 'summary'

/** How long the one-time ★ explanation stays on screen. */
export const STAR_HINT_MS = 7000

/** Only measures how long the session took; never an event time. */
const msSince = (since: number): number => performance.now() - since

/** Tactile feedback per step: trash is heavier, a whole series kept is a success. */
export function feedbackFor(
  type: SortAction['type'],
  count: number,
): HapticKind {
  if (type === 'trash') return count > 1 ? 'success' : 'medium'
  if (type === 'done') return 'light'
  return 'success'
}

export interface QuickSortSessionInput {
  actions: Pick<
    BatchActions,
    'done' | 'moveTo' | 'newStop' | 'revert' | 'star' | 'trash'
  >
  items: readonly MediaItem[]
  onClose: () => void
  placeNames: ReadonlyMap<string, string>
  tree: WorkspaceTree | null
}

/**
 * State and steps of a "Rychlé třídění" session: the stable session list,
 * the current photo, the Undo stack, the stop suggestion and every action.
 */
export function useQuickSortSession({
  actions,
  items,
  onClose,
  placeNames,
  tree,
}: QuickSortSessionInput) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  // Fixed at start so the position does not jump while items leave the list.
  const [session] = useState(() => buildSession(items))
  // Only measures how long the session took; never an event time.
  const [startedAt] = useState(() => performance.now())
  const liveById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  )
  const itemOf = (id: string): MediaItem | undefined =>
    liveById.get(id) ?? session.byId.get(id)

  const [currentId, setCurrentId] = useState(session.ids[0])
  const steps = useSortHistory()
  const { handled, history } = steps
  const [overlay, setOverlay] = useState<QuickSortOverlay>('none')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [starToast, setStarToast] = useState(false)

  const index = Math.max(
    0,
    session.ids.findIndex((id) => id === currentId),
  )
  const id = session.ids[index]
  const item = id === undefined ? undefined : itemOf(id)
  const outcome = id === undefined ? undefined : handled.get(id)
  const isHandled = outcome !== undefined

  // Compare + zoom, shared with the series view. The partner pool is the
  // photo's series (else its day neighbours), never a trashed photo.
  const pool = (
    id === undefined ? [] : comparePool(session, id, handled)
  ).flatMap((own) => {
    const found = itemOf(own)
    return found === undefined ? [] : [found]
  })
  const compare = usePhotoCompare(item, pool)

  const stops = useMemo(
    () =>
      tree === null
        ? []
        : buildMoveStops(tree, t, locale, placeNames, browserZone()),
    [tree, t, locale, placeNames],
  )
  const suggestion = useMemo(
    () =>
      item === undefined
        ? null
        : suggestStop(
            {
              capturedAt: item.capturedAt,
              latitude: item.latitude,
              longitude: item.longitude,
              momentId: item.momentId,
            },
            stops,
          ),
    [item, stops],
  )
  const suggestedStop =
    suggestion === null
      ? undefined
      : stops.find((stop) => stop.id === suggestion.stopId)
  const placedIn = item?.momentId ?? null
  const currentStop =
    placedIn === null ? undefined : stops.find((stop) => stop.id === placedIn)

  const seriesOpen = id === undefined ? [] : openSeries(session, id, handled)
  const hasSeries = seriesOpen.length >= 2
  const summary = useMemo(() => summarize(history), [history])
  const lastDay = lastSortedDay(session, history)

  const openSummary = () => {
    setElapsedMs(msSince(startedAt))
    setOverlay('summary')
  }
  const requestExit = () => {
    if (history.length === 0) onClose()
    else openSummary()
  }

  /**
   * Records a step at once (optimistic, dims the photo, moves on) and settles
   * it when the request is done; a failed request takes the step back.
   */
  const commit = (
    draft: SortDraft,
    request: () => Promise<boolean>,
    after: 'advance' | { goTo: string },
    patch?: () => { createdMomentId: string | null } | undefined,
  ) => {
    haptic(feedbackFor(draft.type, draft.ids.length))
    steps.commit(draft, request, patch === undefined ? {} : { patch })
    if (after === 'advance') {
      const next = new Map(handled)
      const sorted = outcomeOf(draft.type)
      if (sorted !== null) for (const own of draft.ids) next.set(own, sorted)
      const target = advanceOpen(session.ids, next, index)
      const targetId = target === null ? undefined : session.ids[target]
      if (targetId === undefined) openSummary()
      else setCurrentId(targetId)
    } else {
      setCurrentId(after.goTo)
    }
  }

  // A (the current photo) is locked once handled. B only when trashed: a kept
  // B can still be starred or trashed in the same pass.
  const canAct = (
    target: MediaItem | undefined,
    keepsOnly = false,
  ): target is MediaItem =>
    target !== undefined &&
    (target.id === id || keepsOnly
      ? !handled.has(target.id)
      : handled.get(target.id) !== 'trash')
  /** Acts on A (the current photo, then moves on) or on B (stays on A). */
  const trashPhoto = (target: MediaItem | undefined) => {
    if (!canAct(target)) return
    commit(
      { ids: [target.id], type: 'trash' },
      () => actions.trash([target]),
      target.id === id ? 'advance' : { goTo: id ?? target.id },
    )
  }
  const starPhoto = (target: MediaItem | undefined) => {
    if (!canAct(target)) return
    haptic('light')
    steps.record({ ids: [target.id], type: target.starred ? 'unstar' : 'star' })
    void actions.star([target])
    // One-time explanation after the very first ★ on this device.
    if (!target.starred && !starHintSeen()) {
      markStarHintSeen()
      setStarToast(true)
    }
  }
  const donePhoto = (target: MediaItem | undefined) => {
    if (!canAct(target, true)) return
    commit(
      { ids: [target.id], type: 'done' },
      () => actions.done([target]),
      target.id === id ? 'advance' : { goTo: id ?? target.id },
    )
  }
  const trash = () => {
    trashPhoto(item)
  }
  const star = () => {
    starPhoto(item)
  }
  const done = () => {
    donePhoto(item)
  }
  const moveTo = (momentId: string) => {
    if (item === undefined || isHandled) return
    setOverlay('none')
    commit(
      { ids: [item.id], momentId, type: 'moveTo' },
      () => actions.moveTo([item], momentId),
      'advance',
    )
  }
  const newStop = () => {
    if (item === undefined || isHandled) return
    setOverlay('none')
    let created: string | null = null
    commit(
      { ids: [item.id], type: 'newStop' },
      () =>
        actions.newStop([item], {
          onCreated: (momentId) => {
            created = momentId
          },
        }),
      'advance',
      () => ({ createdMomentId: created }),
    )
  }
  const accept = () => {
    if (suggestion !== null) moveTo(suggestion.stopId)
    // Already in a stop and nothing better: keep it there.
    else if (item !== undefined && item.momentId !== null) done()
    else newStop()
  }

  const navigate = (delta: 1 | -1) => {
    const target = stepOpen(session.ids, handled, index, delta)
    const targetId = target === null ? undefined : session.ids[target]
    if (targetId !== undefined) setCurrentId(targetId)
  }
  const skip = () => {
    const target = skipTarget(session.ids, handled, index)
    const targetId = target === null ? undefined : session.ids[target]
    if (targetId !== undefined) setCurrentId(targetId)
  }

  const { canUndo, top } = steps
  const undo = () => {
    if (top === null) return
    haptic('light')
    steps.pop()
    setOverlay('none')
    const first = top.ids[0]
    if (first !== undefined) setCurrentId(first)
    if (top.type === 'star' || top.type === 'unstar') {
      const target = first === undefined ? undefined : itemOf(first)
      if (target !== undefined) void actions.star([target])
      return
    }
    const originals = top.ids.flatMap((own) => {
      const original = session.byId.get(own)
      return original === undefined ? [] : [original]
    })
    // Origins come from the session snapshot, taken before any step.
    void actions
      .revert({
        createdMomentId: top.createdMomentId ?? null,
        items: originals,
        kind: top.type === 'best' ? 'done' : top.type,
      })
      .then((ok) => {
        if (!ok) steps.restore(top)
      })
  }

  const openSeriesView = () => {
    if (hasSeries) setOverlay('series')
  }
  const keepFromSeries = (keepIds: string[], trashIds: string[]) => {
    setOverlay('none')
    const keep = keepIds[0]
    if (trashIds.length === 0 || keep === undefined) return
    const gone = trashIds.flatMap((own) => {
      const found = itemOf(own)
      return found === undefined ? [] : [found]
    })
    commit({ ids: trashIds, type: 'trash' }, () => actions.trash(gone), {
      goTo: keep,
    })
  }

  /** Trashes one photo from inside the series view, which stays open. */
  const trashOneFromSeries = (target: MediaItem) => {
    if (!canAct(target)) return
    const rest = seriesOpen.filter((own) => own !== target.id)
    const goTo = id !== undefined && rest.includes(id) ? id : rest[0]
    if (goTo === undefined) return
    if (rest.length < 2) setOverlay('none')
    commit({ ids: [target.id], type: 'trash' }, () => actions.trash([target]), {
      goTo,
    })
  }

  const continueSession = (targetId?: string) => {
    setOverlay('none')
    const fallback = session.ids.find((own) => !handled.has(own))
    const next = targetId ?? fallback
    if (next !== undefined) setCurrentId(next)
  }

  useEffect(() => {
    if (!starToast) return
    const timer = window.setTimeout(() => {
      setStarToast(false)
    }, STAR_HINT_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [starToast])

  return {
    accept,
    canUndo,
    compare,
    continueSession,
    currentStop,
    done,
    donePhoto,
    elapsedMs,
    handled,
    hasSeries,
    id,
    index,
    isHandled,
    item,
    itemOf,
    keepFromSeries,
    lastDay,
    liveById,
    moveTo,
    navigate,
    newStop,
    openSeriesView,
    outcome,
    overlay,
    pool,
    requestExit,
    seriesOpen,
    session,
    setOverlay,
    skip,
    star,
    starPhoto,
    starToast,
    stops,
    suggestedStop,
    suggestion,
    summary,
    trash,
    trashOneFromSeries,
    trashPhoto,
    undo,
  }
}
