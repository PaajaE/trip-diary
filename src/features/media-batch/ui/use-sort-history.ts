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

/** A step taken off the stack by Undo, with how its own write ended. */
export interface TakenStep {
  action: SortAction
  /** True once the step's write succeeded (at once when already saved). */
  settled: Promise<boolean>
}

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
  /**
   * Undo that does not wait (`undoPending`): takes the top step off the
   * stack even while it is saving. The caller reverts once `settled` says
   * the write went through; a failed write needs no revert and reports
   * no error of its own any more.
   */
  take: () => TakenStep | null
  /** Top of the stack when it can be undone (not while it is saving). */
  top: SortAction | null
}

/**
 * The Undo stack of a sorting session, shared by "Rychlé třídění" and the
 * per-day sorting of the flow. Pure transitions live in model/quick-sort.
 * With `undoPending`, Undo is available at once, also while saving.
 */
export function useSortHistory(
  options: { undoPending?: boolean } = {},
): SortHistoryApi {
  const [history, setHistory] = useState<SortHistory>([])
  const seq = useRef(0)
  const writes = useRef(new Map<number, Promise<boolean>>())
  const taken = useRef(new Set<number>())
  const handled = useMemo(() => handledMap(history), [history])
  const undoPending = options.undoPending === true
  const top = undoPending
    ? (history[history.length - 1] ?? null)
    : undoable(history)
  return {
    canUndo: top !== null,
    commit: (draft, request, commitOptions = {}) => {
      seq.current += 1
      const step = seq.current
      setHistory((h) => pushAction(h, { ...draft, pending: true, seq: step }))
      const failed = (): boolean => {
        writes.current.delete(step)
        if (taken.current.delete(step)) return false
        setHistory((h) => dropAction(h, step))
        commitOptions.onFailed?.()
        return false
      }
      const settled = request().then((ok) => {
        if (!ok) return failed()
        writes.current.delete(step)
        taken.current.delete(step)
        setHistory((h) => settleAction(h, step, commitOptions.patch?.() ?? {}))
        return true
      }, failed)
      writes.current.set(step, settled)
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
    take: () => {
      if (top === null) return null
      setHistory((h) => popAction(h))
      const write = writes.current.get(top.seq)
      if (write === undefined) {
        return { action: top, settled: Promise.resolve(true) }
      }
      taken.current.add(top.seq)
      return { action: top, settled: write }
    },
    top,
  }
}
