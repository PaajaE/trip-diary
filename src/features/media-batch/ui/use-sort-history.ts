import { useMemo, useRef, useState } from 'react'
import {
  dropAction,
  handledMap,
  popAction,
  pushAction,
  settleAction,
  undoable,
  type SortAction,
  type SortHistory,
  type SortOutcome,
} from '@/features/media-batch/model/quick-sort'

/** A step before it gets its sequence number. */
export type SortDraft = Omit<SortAction, 'pending' | 'seq'>

export interface SortHistoryApi {
  canUndo: boolean
  /**
   * Records a step at once (optimistic) and settles it when `request`
   * resolves true; false or a rejection takes the step back (`onFailed`).
   * `patch` adds what only the finished request knows (a created stop).
   */
  commit: (
    draft: SortDraft,
    request: () => Promise<boolean>,
    options?: {
      onFailed?: () => void
      patch?: () => Pick<SortAction, 'createdMomentId'> | undefined
    },
  ) => void
  /** What the session did to each item that left the open list. */
  handled: ReadonlyMap<string, SortOutcome>
  history: SortHistory
  /** Removes the top step (Undo); `restore` puts it back if Undo failed. */
  pop: () => void
  /** Records a step that needs no settling (★ on or off). */
  record: (draft: SortDraft) => void
  restore: (action: SortAction) => void
  /** Top of the stack when it can be undone (not while it is saving). */
  top: SortAction | null
}

/**
 * The Undo stack of a sorting session, shared by "Rychlé třídění" and the
 * per-day sorting of the flow. Pure transitions live in model/quick-sort.
 */
export function useSortHistory(): SortHistoryApi {
  const [history, setHistory] = useState<SortHistory>([])
  const seq = useRef(0)
  const handled = useMemo(() => handledMap(history), [history])
  const top = undoable(history)
  return {
    canUndo: top !== null,
    commit: (draft, request, options = {}) => {
      seq.current += 1
      const step = seq.current
      setHistory((h) => pushAction(h, { ...draft, pending: true, seq: step }))
      const failed = () => {
        setHistory((h) => dropAction(h, step))
        options.onFailed?.()
      }
      request().then((ok) => {
        if (ok)
          setHistory((h) => settleAction(h, step, options.patch?.() ?? {}))
        else failed()
      }, failed)
    },
    handled,
    history,
    pop: () => {
      setHistory((h) => popAction(h))
    },
    record: (draft) => {
      seq.current += 1
      const step = seq.current
      setHistory((h) => pushAction(h, { ...draft, seq: step }))
    },
    restore: (action) => {
      setHistory((h) => pushAction(h, action))
    },
    top,
  }
}
