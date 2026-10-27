import { isPlanEmpty, type OrganizationPlan } from '@trip-diary/core/automation'
import { listJourneyMoments } from '@/entities/moment/api/moment.repository'
import type { Moment } from '@/entities/moment/model/moment'
import type { Place } from '@/entities/place/model/place'
import { updateFlowMarkers } from '@/features/journey-flow/api/flow-markers.store'
import { addRun } from '@/features/journey-flow/model/flow-markers'
import { withJourneyLock } from '@/features/journey-organize/api/journey-lock'
import {
  applyOrganizationPlan,
  loadOrganizeState,
  planFromState,
  resolveDeps,
  type OrganizeDeps,
  type OrganizeResult,
} from '@/features/journey-organize/api/organize-journey'
import {
  dexieSnapshotStore,
  type OrganizeSnapshotStore,
} from '@/features/journey-organize/api/organize-snapshot.store'
import {
  createAutoOrganizer,
  type AutoOrganizer,
  type AutoRunContext,
  type AutoRunOutcome,
} from '@/features/journey-organize/model/auto-organize'
import { buildOrganizeSnapshot } from '@/features/journey-organize/model/organize-snapshot'
import { resolveMissingPlaces } from '@/features/journey-workspace/api/resolve-places'
import { timeoutScheduler } from '@/features/media-import/api/upload-queue'

export interface AutoRunDeps {
  /** Journey-wide mutex shared with the manual organize and the undo. */
  lock: <T>(journeyId: string, task: () => Promise<T>) => Promise<T>
  /** Organize deps (repositories, labels, ids, progress). */
  organize: Partial<OrganizeDeps>
  /** Id of the run (marks its "nová" stops). */
  newRunId: () => string
  /** Bookkeeping clock of the snapshot (never a time of a photo). */
  now: () => number
  /** Remembers the stops the run created ("nová"). */
  rememberRun: (
    userId: string,
    journeyId: string,
    runId: string,
    ids: string[],
  ) => void
  /** Looks up the places of stops without one; never throws. */
  resolvePlaces: (journeyId: string, stopped: () => boolean) => Promise<unknown>
  store: OrganizeSnapshotStore
}

const placeCache = new Map<string, Place | null>()

async function defaultResolvePlaces(
  journeyId: string,
  stopped: () => boolean,
): Promise<unknown> {
  let moments: Moment[]
  try {
    moments = await listJourneyMoments(journeyId)
  } catch {
    return null // the workspace job tries again when it is open
  }
  return resolveMissingPlaces(moments, { cache: placeCache, stopped })
}

function resolveRunDeps(overrides: Partial<AutoRunDeps>): AutoRunDeps {
  return {
    lock: withJourneyLock,
    newRunId: () => crypto.randomUUID(),
    now: () => Date.now(),
    organize: {},
    rememberRun: (userId, journeyId, runId, ids) => {
      updateFlowMarkers(userId, journeyId, (markers) =>
        addRun(markers, runId, ids),
      )
    },
    resolvePlaces: defaultResolvePlaces,
    store: dexieSnapshotStore,
    ...overrides,
  }
}

export interface SnapshotRunResult {
  plan: OrganizationPlan
  /** Null when the plan was empty (nothing written). */
  result: OrganizeResult | null
  /** Requested media that are not ready (or unknown) in the loaded state. */
  unreadyIds: string[]
}

/**
 * The one way the app changes the structure automatically (auto run AND the
 * manual "Uspořádat automaticky"): under the journey lock, load the CURRENT
 * state, plan on it, save the undo snapshot first, then apply with
 * conditional media moves (a photo the user moved meanwhile stays). An empty
 * plan writes nothing and keeps the previous snapshot. A failed snapshot
 * write stops the run (no change without undo).
 */
export function organizeWithSnapshot(
  journeyId: string,
  overrides: Partial<AutoRunDeps> = {},
  requestedIds: readonly string[] = [],
): Promise<SnapshotRunResult> {
  const deps = resolveRunDeps(overrides)
  return deps.lock(journeyId, async () => {
    const state = await loadOrganizeState(journeyId, deps.organize)
    const ready = new Set(
      state.media.filter((item) => item.status === 'ready').map((m) => m.id),
    )
    const unreadyIds = requestedIds.filter((id) => !ready.has(id))
    const plan = planFromState(state, deps.organize)
    if (isPlanEmpty(plan)) return { plan, result: null, unreadyIds }
    const userId = await resolveDeps(deps.organize).getUserId()
    const runId = deps.newRunId()
    await deps.store.put(
      userId,
      buildOrganizeSnapshot(journeyId, state, plan, {
        runId,
        takenAt: new Date(deps.now()).toISOString(),
      }),
    )
    const plannedFrom = new Map(
      state.media.map((item) => [item.id, item.momentId]),
    )
    const result = await applyOrganizationPlan(
      journeyId,
      plan,
      deps.organize,
      plannedFrom,
    )
    deps.rememberRun(
      userId,
      journeyId,
      runId,
      plan.momentsToCreate
        .slice(0, result.counts.momentsCreated)
        .map((moment) => moment.id),
    )
    return { plan, result, unreadyIds }
  })
}

/**
 * One automatic run: `organizeWithSnapshot`, then the places of the new
 * stops are looked up (outside the lock; stopped when someone else wants
 * the journey). Media of the request that are not ready yet are reported so
 * the scheduler tries them again with the next trigger.
 */
export async function runAutoOrganize(
  journeyId: string,
  context: AutoRunContext,
  overrides: Partial<AutoRunDeps> = {},
  requestedIds: readonly string[] = [],
): Promise<AutoRunOutcome> {
  const deps = resolveRunDeps(overrides)
  let outcome: AutoRunOutcome
  try {
    const { plan, result, unreadyIds } = await organizeWithSnapshot(
      journeyId,
      deps,
      requestedIds,
    )
    if (result === null) {
      outcome = { kind: 'nothing', unreadyIds }
    } else {
      const createdMomentIds = plan.momentsToCreate
        .slice(0, result.counts.momentsCreated)
        .map((moment) => moment.id)
      outcome = result.ok
        ? {
            counts: result.counts,
            createdMomentIds,
            kind: 'applied',
            unreadyIds,
          }
        : {
            counts: result.counts,
            createdMomentIds,
            error: result.error,
            kind: 'failed',
            unreadyIds,
          }
    }
  } catch (error) {
    outcome = {
      counts: {
        mediaReassigned: 0,
        momentsCreated: 0,
        momentsDeleted: 0,
        momentsExtended: 0,
        momentsUpdated: 0,
        segmentsDeleted: 0,
        stagesCreated: 0,
        tripsCreated: 0,
      },
      createdMomentIds: [],
      error,
      kind: 'failed',
    }
  }
  context.onApplied(outcome)
  if (outcome.kind === 'applied') {
    await deps.resolvePlaces(journeyId, context.stopped).catch(() => null)
  }
  return outcome
}

/**
 * The app-wide scheduler (single-flight per journey across screens). The
 * labels of segment titles come from the caller of `configureAutoOrganize`.
 */
let organizeOverrides: Partial<OrganizeDeps> = {}

export function configureAutoOrganize(overrides: Partial<OrganizeDeps>): void {
  organizeOverrides = overrides
}

export const autoOrganizer: AutoOrganizer = createAutoOrganizer({
  run: (journeyId, mediaIds, context) =>
    runAutoOrganize(
      journeyId,
      context,
      { organize: organizeOverrides },
      mediaIds,
    ),
  schedule: timeoutScheduler,
})

/**
 * The manual "Uspořádat" from the dialog: exclusive on the organizer (waits
 * for an automatic run, blocks new ones), re-plans on the current state and
 * applies that fresh plan with its own snapshot. Never applies a preview.
 */
export function organizeNow(
  journeyId: string,
  organize: Partial<OrganizeDeps>,
  organizer: AutoOrganizer = autoOrganizer,
  overrides: Partial<AutoRunDeps> = {},
): Promise<SnapshotRunResult> {
  return organizer.exclusive(journeyId, () =>
    organizeWithSnapshot(journeyId, { ...overrides, organize }),
  )
}
