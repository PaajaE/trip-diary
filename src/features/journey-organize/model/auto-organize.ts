/**
 * Scheduling of the automatic organisation after an upload (plan 4f, UX flow
 * point 1). Pure apart from the injected timer and run: requests are
 * debounced, one run per journey at a time (single-flight), a request that
 * comes during a run starts one more run after it, and a request that brings
 * no media id not seen before does nothing.
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

export type AutoRunOutcome =
  /** The plan was empty: nothing was written (the undo snapshot is kept). */
  | { kind: 'nothing' }
  | { counts: AutoOrganizeCounts; createdMomentIds: string[]; kind: 'applied' }
  /** `counts` = what was written before the failure; a rerun converges. */
  | {
      counts: AutoOrganizeCounts
      createdMomentIds: string[]
      error: unknown
      kind: 'failed'
    }

export type AutoOrganizeState =
  | { queued: boolean; status: 'idle' }
  | { queued: boolean; status: 'running' }
  | {
      counts: AutoOrganizeCounts
      createdMomentIds: string[]
      /** Plan was empty: nothing changed. */
      nothingNew: boolean
      queued: boolean
      /** Places of the new stops are still being looked up. */
      resolvingPlaces: boolean
      /** Increases with every finished run (lets the UI refresh once). */
      runSeq: number
      status: 'done'
    }
  | {
      counts: AutoOrganizeCounts
      error: unknown
      queued: boolean
      runSeq: number
      status: 'error'
    }

export interface AutoRunContext {
  /** Call once the plan is written (before places are looked up). */
  onApplied: (outcome: AutoRunOutcome) => void
  /** True when a newer request wants the journey: stop the place lookup. */
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
  getState: (journeyId: string) => AutoOrganizeState
  /** New media of the journey arrived; ids seen before are ignored. */
  request: (journeyId: string, mediaIds: readonly string[]) => void
  subscribe: (listener: () => void) => () => void
  /** Resolves when the journey has no timer and no run (tests). */
  whenIdle: (journeyId: string) => Promise<void>
}

/** Default debounce: lets the last files of a batch finish first. */
export const AUTO_ORGANIZE_DEBOUNCE_MS = 4_000

export const IDLE_STATE: AutoOrganizeState = { queued: false, status: 'idle' }

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
  /** Ids handed to a run already (never trigger again). */
  handled: Set<string>
  pending: Set<string>
  running: Promise<void> | null
  runSeq: number
  state: AutoOrganizeState
  stopRequested: boolean
}

function withQueued(state: AutoOrganizeState, queued: boolean) {
  return { ...state, queued }
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
        handled: new Set(),
        pending: new Set(),
        running: null,
        runSeq: 0,
        state: IDLE_STATE,
        stopRequested: false,
      }
      slots.set(journeyId, slot)
    }
    return slot
  }
  const setState = (slot: Slot, state: AutoOrganizeState) => {
    slot.state = state
    emit()
  }

  function arm(journeyId: string, slot: Slot) {
    slot.cancelTimer?.()
    slot.cancelTimer = deps.schedule(() => {
      slot.cancelTimer = null
      fire(journeyId, slot)
    }, debounceMs)
  }

  function fire(journeyId: string, slot: Slot) {
    if (slot.pending.size === 0) return
    if (slot.running !== null) {
      // Never two runs at once: ask the current one to stop its place
      // lookup; this request runs right after it.
      slot.stopRequested = true
      return
    }
    const ids = [...slot.pending]
    slot.pending.clear()
    for (const id of ids) slot.handled.add(id)
    slot.stopRequested = false
    slot.runSeq += 1
    const seq = slot.runSeq
    setState(slot, { queued: false, status: 'running' })
    let applied = false
    const finish = (outcome: AutoRunOutcome, resolvingPlaces: boolean) => {
      const queued = slot.pending.size > 0
      if (outcome.kind === 'failed') {
        setState(slot, {
          counts: outcome.counts,
          error: outcome.error,
          queued,
          runSeq: seq,
          status: 'error',
        })
      } else {
        setState(slot, {
          counts: outcome.kind === 'applied' ? outcome.counts : ZERO,
          createdMomentIds:
            outcome.kind === 'applied' ? outcome.createdMomentIds : [],
          nothingNew: outcome.kind === 'nothing',
          queued,
          resolvingPlaces,
          runSeq: seq,
          status: 'done',
        })
      }
    }
    const run = deps
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
        slot.running = null
        if (slot.pending.size > 0) arm(journeyId, slot)
      })
    slot.running = run
  }

  return {
    getState: (journeyId) => slots.get(journeyId)?.state ?? IDLE_STATE,
    request(journeyId, mediaIds) {
      const slot = slotOf(journeyId)
      let added = false
      for (const id of mediaIds) {
        if (slot.handled.has(id) || slot.pending.has(id)) continue
        slot.pending.add(id)
        added = true
      }
      if (!added) return
      setState(slot, withQueued(slot.state, true))
      if (slot.running !== null) slot.stopRequested = true
      arm(journeyId, slot)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async whenIdle(journeyId) {
      const slot = slots.get(journeyId)
      while (slot !== undefined && slot.running !== null) await slot.running
    },
  }
}
