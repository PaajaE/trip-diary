import {
  isPlanEmpty,
  planOrganization,
  type NameLabels,
  type OrganizationPlan,
  type SegmentTitleInput,
} from '@trip-diary/core/automation'
import { getJourneyHomeTz } from '@/entities/journey/api/journey-home-tz.repository'
import {
  assignMediaBatchToMoment,
  listJourneyMedia,
  moveMediaIfUnchanged,
} from '@/entities/media/api/media-library.repository'
import {
  createMoments,
  deleteAutoMoments,
  listJourneyMoments,
  updateMoment,
} from '@/entities/moment/api/moment.repository'
import { listPlacesByIds } from '@/entities/place/api/place.repository'
import { derivePlace } from '@/features/journey-organize/lib/place-kind'
import {
  createSegments,
  deleteSuggestedSegments,
  listJourneySegmentsIncludingRejected,
} from '@/entities/segment/api/segment.repository'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { Moment } from '@/entities/moment/model/moment'
import type { Place } from '@/entities/place/model/place'
import type { Segment } from '@/entities/segment/model/segment'
import { getCurrentUserId } from '@/shared/api/current-user'

export type OrganizeStep =
  | 'assignMedia'
  | 'createMoments'
  | 'createSegments'
  | 'deleteMoments'
  | 'deleteSegments'
  | 'load'
  | 'updateMoments'

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
  /** Confirmed stops that grew to take in new photos. */
  momentsExtended: number
  /** Auto stops that kept their id but changed (range, kind, members). */
  momentsUpdated: number
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
  /** Conditional move used when the planned-on state is known. */
  moveIfUnchanged: typeof moveMediaIfUnchanged
  chunkSize: number
  createMoments: typeof createMoments
  createSegments: typeof createSegments
  deleteMoments: typeof deleteAutoMoments
  deleteSegments: typeof deleteSuggestedSegments
  /** Fresh start: rejected suggestions are forgotten and deleted too. */
  forgetRejected?: boolean
  getHomeTz: typeof getJourneyHomeTz
  getUserId: typeof getCurrentUserId
  /** Labels of place-based titles; Czech when omitted. */
  labels?: NameLabels
  listMedia: typeof listJourneyMedia
  listMoments: typeof listJourneyMoments
  listPlaces: typeof listPlacesByIds
  listSegments: typeof listJourneySegmentsIncludingRejected
  newId: () => string
  onProgress?: (progress: OrganizeProgress) => void
  segmentTitle: (input: SegmentTitleInput) => string
  updateMoment: typeof updateMoment
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
    moveIfUnchanged: moveMediaIfUnchanged,
    chunkSize: 100,
    createMoments,
    createSegments,
    deleteMoments: deleteAutoMoments,
    deleteSegments: deleteSuggestedSegments,
    getHomeTz: getJourneyHomeTz,
    getUserId: getCurrentUserId,
    listMedia: listJourneyMedia,
    listMoments: listJourneyMoments,
    listPlaces: listPlacesByIds,
    listSegments: listJourneySegmentsIncludingRejected,
    newId: () => crypto.randomUUID(),
    segmentTitle: defaultSegmentTitle,
    updateMoment,
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

/** What the planner reads: the stored journey as it is right now. */
export interface OrganizeState {
  homeTz: string | null
  media: MediaItem[]
  moments: Moment[]
  places: ReadonlyMap<string, Place>
  /** All segments, rejected suggestions included. */
  segments: Segment[]
}

/** Loads everything the planner (and the undo snapshot) needs. */
export async function loadOrganizeState(
  journeyId: string,
  overrides: Partial<OrganizeDeps> = {},
): Promise<OrganizeState> {
  const deps = resolveDeps(overrides)
  try {
    const [media, moments, segments, homeTz] = await Promise.all([
      deps.listMedia(journeyId),
      deps.listMoments(journeyId),
      deps.listSegments(journeyId),
      deps.getHomeTz(journeyId),
    ])
    // Place names are optional input: without them titles fall back to numbers.
    const placeIds = moments.flatMap((moment) =>
      moment.placeId === null ? [] : [moment.placeId],
    )
    const places = new Map(
      (placeIds.length === 0
        ? []
        : await deps.listPlaces(placeIds).catch(() => [])
      ).map((place) => [place.id, place]),
    )
    return { homeTz, media, moments, places, segments }
  } catch (error) {
    throw new OrganizeError('load', error)
  }
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
  const state = await loadOrganizeState(journeyId, overrides)
  return planFromState(state, overrides)
}

/** Plans from an already loaded state (pure apart from `newId`). */
export function planFromState(
  state: OrganizeState,
  overrides: Partial<OrganizeDeps> = {},
): OrganizationPlan {
  const deps = resolveDeps(overrides)
  const { homeTz, media, moments, places, segments } = state
  try {
    return planOrganization(
      {
        media: media
          .filter((item) => item.status === 'ready')
          .map((item) => ({
            altitude: item.altitude,
            capturedAt: item.capturedAt,
            capturedTz: item.capturedTz,
            device: item.device,
            durationMs: item.durationMs,
            id: item.id,
            kind: item.kind,
            latitude: item.latitude,
            longitude: item.longitude,
            momentId: item.momentId,
            ownerId: item.ownerId,
          })),
        moments: moments.map((moment) => {
          const place =
            moment.placeId === null ? undefined : places.get(moment.placeId)
          const derived =
            place === undefined
              ? undefined
              : derivePlace({
                  kind: place.kind,
                  name: place.name,
                  region: place.region,
                })
          return {
            body: moment.body,
            coverMediaId: moment.coverMediaId,
            endsAt: moment.endsAt,
            id: moment.id,
            kind: moment.kind,
            latitude: moment.latitude,
            locked: moment.locked,
            longitude: moment.longitude,
            origin: moment.origin,
            ...(derived === undefined
              ? {}
              : {
                  placeCountry: place?.countryCode ?? undefined,
                  placeKind: derived.kind,
                  placeName: derived.name,
                }),
            published: moment.published,
            startsAt: moment.startsAt,
            title: moment.title,
          }
        }),
        segments: segments.map((segment) => ({
          endsAt: segment.endsAt,
          id: segment.id,
          kind: segment.kind,
          origin: segment.origin,
          startsAt: segment.startsAt,
          title: segment.title,
          tripType: segment.tripType,
        })),
      },
      {
        homeTz: homeTz ?? 'UTC',
        ...(deps.labels === undefined ? {} : { labels: deps.labels }),
        ...(deps.forgetRejected === true ? { forgetRejected: true } : {}),
        newId: deps.newId,
        segmentTitle: deps.segmentTitle,
      },
    )
  } catch (error) {
    throw new OrganizeError('load', error)
  }
}

function emptyCounts(): OrganizeCounts {
  return {
    mediaReassigned: 0,
    momentsCreated: 0,
    momentsDeleted: 0,
    momentsExtended: 0,
    momentsUpdated: 0,
    segmentsDeleted: 0,
    stagesCreated: 0,
    tripsCreated: 0,
  }
}

/**
 * Applies a plan through repositories. Order (each step is safe to rerun
 * after a failure because a rerun re-plans from the stored state):
 * create moments, move media, then update kept auto moments and grow
 * confirmed ones (range only, never text, cover or lock; written after the
 * media so a range never grows without its photos), delete orphaned auto
 * moments, delete old suggested segments, insert fresh suggested segments.
 * Stops at the first failing step. The automation writes no title: names
 * come from the place (see stop-names in core), resolved afterwards by the
 * workspace job (useResolveMissingPlaces).
 */
export async function applyOrganizationPlan(
  journeyId: string,
  plan: OrganizationPlan,
  overrides: Partial<OrganizeDeps> = {},
  /**
   * Where each media item was when the plan was made (from the planned-on
   * state). When given, a photo moves only if it is still there, so a photo
   * the user moved during the run is never overwritten.
   */
  plannedFrom?: ReadonlyMap<string, string | null>,
): Promise<OrganizeResult> {
  const deps = resolveDeps(overrides)
  const counts = emptyCounts()
  const total =
    plan.momentsToCreate.length +
    plan.momentsToUpdate.length +
    plan.momentsToExtend.length +
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
          kind: moment.kind,
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
    // Grouped by target and, when known, by where the media were planned.
    const groups = new Map<
      string,
      { from: string | null | undefined; ids: string[]; to: string }
    >()
    for (const { mediaId, momentId } of plan.mediaReassignments) {
      const from =
        plannedFrom === undefined
          ? undefined
          : (plannedFrom.get(mediaId) ?? null)
      const key = `${momentId}|${from === undefined ? '*' : (from ?? '-')}`
      const group = groups.get(key)
      if (group === undefined)
        groups.set(key, { from, ids: [mediaId], to: momentId })
      else group.ids.push(mediaId)
    }
    for (const { from, ids, to } of groups.values()) {
      for (const part of chunks(ids, deps.chunkSize)) {
        if (from === undefined) {
          await deps.assignMedia(part, to)
          counts.mediaReassigned += part.length
        } else {
          const moved = await deps.moveIfUnchanged(part, to, from)
          counts.mediaReassigned += moved.length
        }
        advance(step, part.length)
      }
    }

    step = 'updateMoments'
    // After the media moved: a range never grows without its photos, so an
    // interrupted run cannot let the next one chain the intake window.
    for (const moment of plan.momentsToUpdate) {
      await deps.updateMoment(moment.id, {
        endsAt: moment.endsAt,
        kind: moment.kind,
        latitude: moment.latitude,
        longitude: moment.longitude,
        // Moved far: the old place is wrong; the place job looks it up again.
        ...(moment.clearPlace === true ? { placeId: null } : {}),
        startsAt: moment.startsAt,
      })
      counts.momentsUpdated += 1
      advance(step, 1)
    }
    for (const extension of plan.momentsToExtend) {
      // Range only: a pure range patch does not touch text, cover or lock.
      await deps.updateMoment(extension.id, {
        endsAt: extension.endsAt,
        startsAt: extension.startsAt,
      })
      counts.momentsExtended += 1
      advance(step, 1)
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
  const empty = emptyCounts()
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
