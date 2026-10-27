/**
 * Scheduling of the automatic organisation after an upload (plan 4f, UX flow
 * point 1). Pure apart from the injected timer and run: requests are
 * debounced, one task per journey at a time (single-flight), a request that
 * comes during a run starts one more run after it, and a request that brings
 * no media id not seen before does nothing.
 *
 * Exclusive tasks (the manual organize, "Vrátit uspořádání") share the
 * single-flight slot: they wait for a running organize (asking it to stop its
 * place lookup) and no debounced run starts while one is active.
 *
 * Media of a failed run, and media that were not ready yet, are not
 * "handled": they join the next trigger again.
 */

export interface AutoOrganizeCounts {
  mediaReassigned: number
  momentsCreated: number
  momentsDeleted: number
  momentsExtended: number
  momentsUpdated: number
  segmentsDeleted: number
  stagesCreated: number
  tripsCreated: number
}

interface OutcomeExtras {
  /** Requested media that were not ready (or not found): retried later. */
  unreadyIds?: readonly string[]
}

export type AutoRunOutcome =
  /** The plan was empty: nothing was written (the undo snapshot is kept). */
  | ({ kind: 'nothing' } & OutcomeExtras)
  | ({
      counts: AutoOrganizeCounts
      createdMomentIds: string[]
      kind: 'applied'
    } & OutcomeExtras)
  /** `counts` = what was written before the failure; a rerun converges. */
  | ({
      counts: AutoOrganizeCounts
      createdMomentIds: string[]
      error: unknown
      kind: 'failed'
    } & OutcomeExtras)

interface StateFlags {
  /** A manual organize or an undo holds the journey right now. */
  exclusive: boolean
  /** New media wait for the debounce (or for the running task). */
  queued: boolean
}

export type AutoOrganizeState =
  | ({ status: 'idle' } & StateFlags)
  | ({ status: 'running' } & StateFlags)
  | ({
      counts: AutoOrganizeCounts
      createdMomentIds: string[]
      /** Plan was empty: nothing changed. */
      nothingNew: boolean
      /** Places of the new stops are still being looked up. */
      resolvingPlaces: boolean
      /** Increases with every finished run (lets the UI refresh once). */
      runSeq: number
      status: 'done'
    } & StateFlags)
  | ({
      counts: AutoOrganizeCounts
      error: unknown
      /** Media that will be organised again with the next trigger. */
      retryCount: number
      runSeq: number
      status: 'error'
    } & StateFlags)

export interface AutoRunContext {
  /** Call once the plan is written (before places are looked up). */
  onApplied: (outcome: AutoRunOutcome) => void
  /** True when someone else wants the journey: stop the place lookup. */
  stopped: () => boolean
}

export interface AutoOrganizerDeps {
  debounceMs?: number
  run: (
    journeyId: string,
    mediaIds: readonly string[],
    context: AutoRunContext,
  ) => Promise<AutoRunOutcome>
  /** Timer seam; returns a cancel function. */
  schedule: (callback: () => void, delayMs: number) => () => void
}

export interface AutoOrganizer {
  /**
   * Runs `task` alone on the journey (manual organize, undo): waits for a
   * running organize, and blocks debounced runs until it is over.
   */
  exclusive: <T>(journeyId: string, task: () => Promise<T>) => Promise<T>
  getState: (journeyId: string) => AutoOrganizeState
  /** New media of the journey arrived; ids seen before are ignored. */
  request: (journeyId: string, mediaIds: readonly string[]) => void
  /**
   * Test seam: resolves once no run or exclusive task of the journey is
   * active. A pending debounce timer is NOT awaited.
   */
  settled: (journeyId: string) => Promise<void>
  subscribe: (listener: () => void) => () => void
}

/** Default debounce: lets the last files of a batch finish first. */
export const AUTO_ORGANIZE_DEBOUNCE_MS = 4_000

export const IDLE_STATE: AutoOrganizeState = {
  exclusive: false,
  queued: false,
  status: 'idle',
}

const ZERO: AutoOrganizeCounts = {
  mediaReassigned: 0,
  momentsCreated: 0,
  momentsDeleted: 0,
  momentsExtended: 0,
  momentsUpdated: 0,
  segmentsDeleted: 0,
  stagesCreated: 0,
  tripsCreated: 0,
}

interface Slot {
  cancelTimer: (() => void) | null
  exclusive: number
  /** Ids handed to a successful run (never trigger again). */
  handled: Set<string>
  pending: Set<string>
  /** Ids of failed runs / not ready yet: they join the next trigger. */
  retry: Set<string>
  running: Promise<unknown> | null
  runSeq: number
  state: AutoOrganizeState
  stopRequested: boolean
}

export function createAutoOrganizer(deps: AutoOrganizerDeps): AutoOrganizer {
  const debounceMs = deps.debounceMs ?? AUTO_ORGANIZE_DEBOUNCE_MS
  const slots = new Map<string, Slot>()
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }
  const slotOf = (journeyId: string): Slot => {
    let slot = slots.get(journeyId)
    if (slot === undefined) {
      slot = {
        cancelTimer: null,
        exclusive: 0,
        handled: new Set(),
        pending: new Set(),
        retry: new Set(),
        running: null,
        runSeq: 0,
        state: IDLE_STATE,
        stopRequested: false,
      }
      slots.set(journeyId, slot)
    }
    return slot
  }
  const flags = (slot: Slot): StateFlags => ({
    exclusive: slot.exclusive > 0,
    queued: slot.pending.size > 0,
  })
  const setState = (slot: Slot, state: AutoOrganizeState) => {
    slot.state = state
    emit()
  }
  const refresh = (slot: Slot) => {
    setState(slot, { ...slot.state, ...flags(slot) })
  }

  function arm(journeyId: string, slot: Slot) {
    slot.cancelTimer?.()
    slot.cancelTimer = deps.schedule(() => {
      slot.cancelTimer = null
      fire(journeyId, slot)
    }, debounceMs)
  }

  const after = (journeyId: string, slot: Slot) => {
    slot.running = null
    if (slot.pending.size > 0) arm(journeyId, slot)
    refresh(slot)
  }

  function fire(journeyId: string, slot: Slot) {
    if (slot.pending.size === 0) return
    if (slot.running !== null) {
      // Never two tasks at once: ask the current one to stop its place
      // lookup; this request runs right after it (re-armed in `after`).
      slot.stopRequested = true
      return
    }
    const ids = [...slot.pending]
    slot.pending.clear()
    slot.stopRequested = false
    slot.runSeq += 1
    const seq = slot.runSeq
    setState(slot, { ...flags(slot), status: 'running' })
    let applied = false
    const settle = (outcome: AutoRunOutcome) => {
      const unready = new Set(outcome.unreadyIds ?? [])
      for (const id of ids) {
        if (outcome.kind === 'failed' || unready.has(id)) slot.retry.add(id)
        else slot.handled.add(id)
      }
    }
    const finish = (outcome: AutoRunOutcome, resolvingPlaces: boolean) => {
      settle(outcome)
      if (outcome.kind === 'failed') {
        setState(slot, {
          ...flags(slot),
          counts: outcome.counts,
          error: outcome.error,
          retryCount: slot.retry.size,
          runSeq: seq,
          status: 'error',
        })
      } else {
        setState(slot, {
          ...flags(slot),
          counts: outcome.kind === 'applied' ? outcome.counts : ZERO,
          createdMomentIds:
            outcome.kind === 'applied' ? outcome.createdMomentIds : [],
          nothingNew: outcome.kind === 'nothing',
          resolvingPlaces,
          runSeq: seq,
          status: 'done',
        })
      }
    }
    slot.running = deps
      .run(journeyId, ids, {
        onApplied: (outcome) => {
          applied = true
          finish(outcome, outcome.kind === 'applied')
        },
        stopped: () => slot.stopRequested,
      })
      .then(
        (outcome) => {
          if (!applied || slot.state.status !== 'done') finish(outcome, false)
          else setState(slot, { ...slot.state, resolvingPlaces: false })
        },
        (error: unknown) => {
          finish(
            { counts: ZERO, createdMomentIds: [], error, kind: 'failed' },
            false,
          )
        },
      )
      .finally(() => {
        after(journeyId, slot)
      })
  }

  return {
    async exclusive(journeyId, task) {
      const slot = slotOf(journeyId)
      slot.exclusive += 1
      slot.stopRequested = true
      slot.cancelTimer?.()
      slot.cancelTimer = null
      refresh(slot)
      try {
        while (slot.running !== null) {
          await slot.running.catch(() => undefined)
        }
        const run = task()
        slot.running = run
        return await run
      } finally {
        slot.exclusive -= 1
        after(journeyId, slot)
      }
    },
    getState: (journeyId) => slots.get(journeyId)?.state ?? IDLE_STATE,
    request(journeyId, mediaIds) {
      const slot = slotOf(journeyId)
      let added = false
      for (const id of mediaIds) {
        if (slot.handled.has(id) || slot.pending.has(id)) continue
        slot.pending.add(id)
        slot.retry.delete(id)
        added = true
      }
      if (!added) return
      // Media of a failed run come along with the next trigger.
      for (const id of slot.retry) slot.pending.add(id)
      slot.retry.clear()
      refresh(slot)
      if (slot.running !== null) {
        slot.stopRequested = true
        return // re-armed when the running task is over
      }
      arm(journeyId, slot)
    },
    async settled(journeyId) {
      const slot = slots.get(journeyId)
      while (slot !== undefined && slot.running !== null) {
        await slot.running.catch(() => undefined)
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
