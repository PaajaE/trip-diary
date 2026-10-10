import {
  isPlanEmpty,
  planOrganization,
  type OrganizationPlan,
  type SegmentTitleInput,
} from '@trip-diary/core/automation'
import { getJourneyHomeTz } from '@/entities/journey/api/journey-home-tz.repository'
import {
  assignMediaBatchToMoment,
  listJourneyMedia,
} from '@/entities/media/api/media-library.repository'
import {
  createMoments,
  deleteAutoMoments,
  listJourneyMoments,
} from '@/entities/moment/api/moment.repository'
import {
  createSegments,
  deleteSuggestedSegments,
  listJourneySegmentsIncludingRejected,
} from '@/entities/segment/api/segment.repository'
import { getCurrentUserId } from '@/shared/api/current-user'

export type OrganizeStep =
  | 'assignMedia'
  | 'createMoments'
  | 'createSegments'
  | 'deleteMoments'
  | 'deleteSegments'
  | 'load'

/** Typed failure naming the step that stopped the run. */
export class OrganizeError extends Error {
  readonly step: OrganizeStep

  constructor(step: OrganizeStep, cause: unknown) {
    super(
      `organize failed at ${step}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
    this.name = 'OrganizeError'
    this.step = step
  }
}

export interface OrganizeCounts {
  mediaReassigned: number
  momentsCreated: number
  momentsDeleted: number
  segmentsDeleted: number
  stagesCreated: number
  tripsCreated: number
}

export interface OrganizeProgress {
  done: number
  step: OrganizeStep
  total: number
}

export type OrganizeResult =
  | { counts: OrganizeCounts; ok: true }
  /** `counts` shows what was applied before the failure; a rerun converges. */
  | { counts: OrganizeCounts; error: OrganizeError; ok: false }

export interface OrganizeDeps {
  assignMedia: typeof assignMediaBatchToMoment
  chunkSize: number
  createMoments: typeof createMoments
  createSegments: typeof createSegments
  deleteMoments: typeof deleteAutoMoments
  deleteSegments: typeof deleteSuggestedSegments
  getHomeTz: typeof getJourneyHomeTz
  getUserId: typeof getCurrentUserId
  listMedia: typeof listJourneyMedia
  listMoments: typeof listJourneyMoments
  listSegments: typeof listJourneySegmentsIncludingRejected
  newId: () => string
  onProgress?: (progress: OrganizeProgress) => void
  segmentTitle: (input: SegmentTitleInput) => string
}

export function defaultSegmentTitle(input: SegmentTitleInput): string {
  return input.kind === 'stage'
    ? `Stage ${String(input.index)}`
    : `Trip ${String(input.index)}`
}

export function resolveDeps(
  overrides: Partial<OrganizeDeps> = {},
): OrganizeDeps {
  return {
    assignMedia: assignMediaBatchToMoment,
    chunkSize: 100,
    createMoments,
    createSegments,
    deleteMoments: deleteAutoMoments,
    deleteSegments: deleteSuggestedSegments,
    getHomeTz: getJourneyHomeTz,
    getUserId: getCurrentUserId,
    listMedia: listJourneyMedia,
    listMoments: listJourneyMoments,
    listSegments: listJourneySegmentsIncludingRejected,
    newId: () => crypto.randomUUID(),
    segmentTitle: defaultSegmentTitle,
    ...overrides,
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

/**
 * Dry run: loads the journey and plans, without writing anything. Hand-made
 * data (locked/manual moments, manual/accepted/rejected segments) is passed
 * to the planner, which never changes it.
 */
export async function previewOrganization(
  journeyId: string,
  overrides: Partial<OrganizeDeps> = {},
): Promise<OrganizationPlan> {
  const deps = resolveDeps(overrides)
  try {
    const [media, moments, segments, homeTz] = await Promise.all([
      deps.listMedia(journeyId),
      deps.listMoments(journeyId),
      deps.listSegments(journeyId),
      deps.getHomeTz(journeyId),
    ])
    return planOrganization(
      {
        media: media
          .filter((item) => item.status === 'ready')
          .map((item) => ({
            capturedAt: item.capturedAt,
            id: item.id,
            latitude: item.latitude,
            longitude: item.longitude,
            momentId: item.momentId,
          })),
        moments: moments.map((moment) => ({
          endsAt: moment.endsAt,
          id: moment.id,
          locked: moment.locked,
          origin: moment.origin,
          startsAt: moment.startsAt,
        })),
        segments: segments.map((segment) => ({
          endsAt: segment.endsAt,
          id: segment.id,
          kind: segment.kind,
          origin: segment.origin,
          startsAt: segment.startsAt,
          tripType: segment.tripType,
        })),
      },
      {
        homeTz: homeTz ?? 'UTC',
        newId: deps.newId,
        segmentTitle: deps.segmentTitle,
      },
    )
  } catch (error) {
    throw new OrganizeError('load', error)
  }
}

/**
 * Applies a plan through repositories. Order (each step is safe to rerun
 * after a failure because a rerun re-plans from the stored state):
 * create moments, move media, delete orphaned auto moments, delete old
 * suggested segments, insert fresh suggested segments. Stops at the first
 * failing step.
 */
export async function applyOrganizationPlan(
  journeyId: string,
  plan: OrganizationPlan,
  overrides: Partial<OrganizeDeps> = {},
): Promise<OrganizeResult> {
  const deps = resolveDeps(overrides)
  const counts: OrganizeCounts = {
    mediaReassigned: 0,
    momentsCreated: 0,
    momentsDeleted: 0,
    segmentsDeleted: 0,
    stagesCreated: 0,
    tripsCreated: 0,
  }
  const total =
    plan.momentsToCreate.length +
    plan.mediaReassignments.length +
    plan.momentsToDelete.length +
    plan.segmentsToDelete.length +
    plan.stageSuggestions.length +
    plan.tripSuggestions.length
  let done = 0
  const advance = (step: OrganizeStep, by: number) => {
    done += by
    deps.onProgress?.({ done, step, total })
  }
  let step: OrganizeStep = 'load'
  try {
    step = 'createMoments'
    const userId = await deps.getUserId()
    for (const part of chunks(plan.momentsToCreate, deps.chunkSize)) {
      await deps.createMoments(
        part.map((moment) => ({
          createdBy: userId,
          endsAt: moment.endsAt,
          id: moment.id,
          journeyId,
          latitude: moment.latitude,
          locked: false,
          longitude: moment.longitude,
          origin: 'auto',
          startsAt: moment.startsAt,
        })),
      )
      counts.momentsCreated += part.length
      advance(step, part.length)
    }

    step = 'assignMedia'
    const byMoment = new Map<string, string[]>()
    for (const { mediaId, momentId } of plan.mediaReassignments) {
      const list = byMoment.get(momentId)
      if (list === undefined) byMoment.set(momentId, [mediaId])
      else list.push(mediaId)
    }
    for (const [momentId, mediaIds] of byMoment) {
      for (const part of chunks(mediaIds, deps.chunkSize)) {
        await deps.assignMedia(part, momentId)
        counts.mediaReassigned += part.length
        advance(step, part.length)
      }
    }

    step = 'deleteMoments'
    for (const part of chunks(plan.momentsToDelete, deps.chunkSize)) {
      await deps.deleteMoments(part)
      counts.momentsDeleted += part.length
      advance(step, part.length)
    }

    step = 'deleteSegments'
    for (const part of chunks(plan.segmentsToDelete, deps.chunkSize)) {
      await deps.deleteSegments(part)
      counts.segmentsDeleted += part.length
      advance(step, part.length)
    }

    step = 'createSegments'
    for (const [kind, list] of [
      ['stage', plan.stageSuggestions],
      ['trip', plan.tripSuggestions],
    ] as const) {
      for (const part of chunks(list, deps.chunkSize)) {
        await deps.createSegments(
          part.map((segment) => ({
            createdBy: userId,
            endsAt: segment.endsAt,
            id: segment.id,
            journeyId,
            kind: segment.kind,
            origin: 'suggested',
            position: segment.position,
            startsAt: segment.startsAt,
            title: segment.title,
            tripType: segment.tripType,
          })),
        )
        if (kind === 'stage') counts.stagesCreated += part.length
        else counts.tripsCreated += part.length
        advance(step, part.length)
      }
    }
  } catch (error) {
    return { counts, error: new OrganizeError(step, error), ok: false }
  }
  return { counts, ok: true }
}

/** Loads, plans and applies in one go. */
export async function organizeJourney(
  journeyId: string,
  deps: Partial<OrganizeDeps> = {},
): Promise<OrganizeResult> {
  const empty: OrganizeCounts = {
    mediaReassigned: 0,
    momentsCreated: 0,
    momentsDeleted: 0,
    segmentsDeleted: 0,
    stagesCreated: 0,
    tripsCreated: 0,
  }
  let plan: OrganizationPlan
  try {
    plan = await previewOrganization(journeyId, deps)
  } catch (error) {
    return {
      counts: empty,
      error:
        error instanceof OrganizeError
          ? error
          : new OrganizeError('load', error),
      ok: false,
    }
  }
  if (isPlanEmpty(plan)) return { counts: empty, ok: true }
  return applyOrganizationPlan(journeyId, plan, deps)
}
