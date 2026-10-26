import { isPlanEmpty } from '@trip-diary/core/automation'
import { listJourneyMoments } from '@/entities/moment/api/moment.repository'
import type { Moment } from '@/entities/moment/model/moment'
import type { Place } from '@/entities/place/model/place'
import { updateFlowMarkers } from '@/features/journey-flow/api/flow-markers.store'
import { addRun } from '@/features/journey-flow/model/flow-markers'
import {
  applyOrganizationPlan,
  loadOrganizeState,
  planFromState,
  type OrganizeDeps,
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
  /** Organize deps (repositories, labels, ids). */
  organize: Partial<OrganizeDeps>
  /** Id of the run (marks its "nová" stops). */
  newRunId: () => string
  /** Bookkeeping clock of the snapshot (never a time of a photo). */
  now: () => number
  /** Remembers the stops the run created ("nová"). */
  rememberRun: (journeyId: string, runId: string, ids: string[]) => void
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
    newRunId: () => crypto.randomUUID(),
    now: () => Date.now(),
    organize: {},
    rememberRun: (journeyId, runId, ids) => {
      updateFlowMarkers(journeyId, (markers) => addRun(markers, runId, ids))
    },
    resolvePlaces: defaultResolvePlaces,
    store: dexieSnapshotStore,
    ...overrides,
  }
}

/**
 * One automatic run: load, plan, and when the plan changes anything, save
 * the undo snapshot FIRST, then apply, remember the new stops ("nová") and
 * look up their places. An empty plan writes nothing and keeps the previous
 * snapshot. A failed snapshot write stops the run (no change without undo).
 */
export async function runAutoOrganize(
  journeyId: string,
  context: AutoRunContext,
  overrides: Partial<AutoRunDeps> = {},
): Promise<AutoRunOutcome> {
  const deps = resolveRunDeps(overrides)
  const zero = {
    mediaReassigned: 0,
    momentsCreated: 0,
    momentsDeleted: 0,
    momentsExtended: 0,
    momentsUpdated: 0,
    segmentsDeleted: 0,
    stagesCreated: 0,
    tripsCreated: 0,
  }
  let outcome: AutoRunOutcome
  try {
    const state = await loadOrganizeState(journeyId, deps.organize)
    const plan = planFromState(state, deps.organize)
    if (isPlanEmpty(plan)) {
      outcome = { kind: 'nothing' }
      context.onApplied(outcome)
      return outcome
    }
    const runId = deps.newRunId()
    await deps.store.put(
      buildOrganizeSnapshot(journeyId, state, plan, {
        runId,
        takenAt: new Date(deps.now()).toISOString(),
      }),
    )
    const result = await applyOrganizationPlan(journeyId, plan, deps.organize)
    const createdMomentIds = plan.momentsToCreate
      .slice(0, result.counts.momentsCreated)
      .map((moment) => moment.id)
    deps.rememberRun(journeyId, runId, createdMomentIds)
    outcome = result.ok
      ? { counts: result.counts, createdMomentIds, kind: 'applied' }
      : {
          counts: result.counts,
          createdMomentIds,
          error: result.error,
          kind: 'failed',
        }
  } catch (error) {
    outcome = { counts: zero, createdMomentIds: [], error, kind: 'failed' }
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
  run: (journeyId, _mediaIds, context) =>
    runAutoOrganize(journeyId, context, { organize: organizeOverrides }),
  schedule: timeoutScheduler,
})
