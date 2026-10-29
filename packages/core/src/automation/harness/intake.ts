import { summarizeZonedDays } from '../days.ts'
import { pickLocalDay } from '../local-day.ts'
import {
  DEFAULT_INTAKE_WINDOW_MS,
  isPlanEmpty,
  isProtected,
  planOrganization,
  type OrganizationPlan,
  type OrganizeInput,
  type OrganizeMedia,
  type OrganizeMoment,
  type OrganizeOptions,
  type OrganizeSegment,
} from '../organize.ts'
import type { PropertyResult } from './properties.ts'
import type { HarnessPoint } from './scenarios.ts'

/**
 * ZS-5 harness: intake of new photos into existing (confirmed) stops and
 * stable stop ids, on the product pipeline (`planOrganization`) with an
 * in-memory "database" that applies plans the way the app does.
 */

/** Options with ids `<prefix>-1, -2, ...`; use a new prefix per run. */
export function harnessOptions(
  homeTz = 'UTC',
  extra: Partial<OrganizeOptions> = {},
  prefix = 'new',
): OrganizeOptions {
  let counter = 0
  return {
    homeTz,
    newId: () => {
      counter += 1
      return `${prefix}-${String(counter)}`
    },
    segmentTitle: ({ index, kind }) => `${kind} ${String(index)}`,
    ...extra,
  }
}

export function toMedia(
  point: HarnessPoint,
  momentId: string | null = null,
): OrganizeMedia {
  return {
    capturedAt: point.capturedAt,
    capturedTz: point.capturedTz,
    device: point.device,
    durationMs: point.durationMs,
    id: point.id,
    kind: point.kind,
    latitude: point.latitude,
    longitude: point.longitude,
    livePhotoOf: point.livePhotoOf,
    momentId,
    ownerId: point.author,
  }
}

/** Applies a plan to the stored state the way `applyOrganizationPlan` does. */
export function applyPlan(
  input: OrganizeInput,
  plan: OrganizationPlan,
): OrganizeInput {
  const assigned = new Map(
    plan.mediaReassignments.map((r) => [r.mediaId, r.momentId]),
  )
  const dropped = new Set(plan.momentsToDelete)
  const updated = new Map(plan.momentsToUpdate.map((m) => [m.id, m]))
  const extended = new Map(plan.momentsToExtend.map((m) => [m.id, m]))
  const kept = input.moments
    .filter((moment) => !dropped.has(moment.id))
    .map((moment): OrganizeMoment => {
      const update = updated.get(moment.id)
      if (update !== undefined) {
        return {
          ...moment,
          endsAt: update.endsAt,
          kind: update.kind,
          latitude: update.latitude,
          longitude: update.longitude,
          startsAt: update.startsAt,
        }
      }
      const extension = extended.get(moment.id)
      return extension === undefined
        ? moment
        : {
            ...moment,
            endsAt: extension.endsAt,
            startsAt: extension.startsAt,
          }
    })
  const created = plan.momentsToCreate.map(
    (moment): OrganizeMoment => ({
      endsAt: moment.endsAt,
      id: moment.id,
      kind: moment.kind,
      latitude: moment.latitude,
      locked: false,
      longitude: moment.longitude,
      origin: 'auto',
      startsAt: moment.startsAt,
    }),
  )
  const droppedSegments = new Set(plan.segmentsToDelete)
  return {
    media: input.media.map((item) => ({
      ...item,
      momentId: assigned.get(item.id) ?? item.momentId,
    })),
    moments: [...kept, ...created],
    segments: [
      ...input.segments.filter((segment) => !droppedSegments.has(segment.id)),
      ...[...plan.stageSuggestions, ...plan.tripSuggestions].map(
        (segment): OrganizeSegment => ({
          endsAt: segment.endsAt,
          id: segment.id,
          kind: segment.kind,
          origin: 'suggested',
          startsAt: segment.startsAt,
          title: segment.title,
          tripType: segment.tripType,
        }),
      ),
    ],
  }
}

/** Organises the points, then locks every resulting moment (user confirmed). */
export function confirmedState(
  points: readonly HarnessPoint[],
  homeTz = 'UTC',
): OrganizeInput {
  const input: OrganizeInput = {
    media: points.map((point) => toMedia(point)),
    moments: [],
    segments: [],
  }
  const applied = applyPlan(
    input,
    planOrganization(input, harnessOptions(homeTz, {}, 'seed')),
  )
  return {
    ...applied,
    moments: applied.moments.map((moment) => ({ ...moment, locked: true })),
  }
}

/** Local day of an instant by the photo days of the input (04:00 rule). */
function dayResolver(
  input: OrganizeInput,
  homeTz: string,
): (iso: string) => string {
  const days = summarizeZonedDays(
    input.media.map((item) => ({
      capturedAt: item.capturedAt,
      capturedTz: item.capturedTz ?? null,
      id: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
    })),
    homeTz,
  )
  const dates = days.map((day) => day.date)
  const zones = days.map((day) => day.timeZone)
  return (iso) => pickLocalDay(Date.parse(iso), homeTz, dates, zones)
}

/**
 * Invariants of every intake plan:
 *  - a confirmed stop only grows (start never later, end never earlier), by
 *    at most the window at each edge, and never across a local day boundary;
 *  - only photos that had no moment join it, and only confirmed stops grow;
 *  - a confirmed stop is never deleted, updated, recreated, and its own
 *    photos never move away;
 *  - applying the plan and planning again gives an empty plan (idempotence).
 */
export function intakeInvariants(
  input: OrganizeInput,
  options: OrganizeOptions,
): PropertyResult {
  const violations: string[] = []
  const windowMs = options.intakeWindowMs ?? DEFAULT_INTAKE_WINDOW_MS
  const plan = planOrganization(input, options)
  const byId = new Map(input.moments.map((moment) => [moment.id, moment]))
  const confirmed = new Set(
    input.moments.filter(isProtected).map((moment) => moment.id),
  )
  const mediaById = new Map(input.media.map((item) => [item.id, item]))
  const dayOf = dayResolver(input, options.homeTz)
  for (const extension of plan.momentsToExtend) {
    const stored = byId.get(extension.id)
    if (stored === undefined || !confirmed.has(extension.id)) {
      violations.push(`extended ${extension.id} is not a confirmed stop`)
      continue
    }
    const oldStart = Date.parse(stored.startsAt)
    const oldEnd = Date.parse(stored.endsAt)
    const start = Date.parse(extension.startsAt)
    const end = Date.parse(extension.endsAt)
    if (start > oldStart || end < oldEnd) {
      violations.push(`${extension.id} shrank`)
    }
    if (oldStart - start > windowMs || end - oldEnd > windowMs) {
      violations.push(`${extension.id} grew beyond the window`)
    }
    if (
      (start < oldStart &&
        dayOf(extension.startsAt) !== dayOf(stored.startsAt)) ||
      (end > oldEnd && dayOf(extension.endsAt) !== dayOf(stored.endsAt))
    ) {
      violations.push(`${extension.id} grew across a day boundary`)
    }
    for (const mediaId of extension.mediaIds) {
      const momentId = mediaById.get(mediaId)?.momentId ?? null
      if (momentId !== null && byId.has(momentId)) {
        violations.push(`${mediaId} was taken from ${momentId}`)
      }
    }
  }
  for (const id of [
    ...plan.momentsToDelete,
    ...plan.momentsToUpdate.map((moment) => moment.id),
    ...plan.momentsToCreate.map((moment) => moment.id),
  ]) {
    if (confirmed.has(id)) violations.push(`confirmed ${id} was changed`)
  }
  for (const { mediaId, momentId } of plan.mediaReassignments) {
    const from = mediaById.get(mediaId)?.momentId ?? null
    if (from !== null && confirmed.has(from) && from !== momentId) {
      violations.push(`${mediaId} left confirmed ${from}`)
    }
  }
  const again = planOrganization(applyPlan(input, plan), {
    ...options,
    newId: harnessOptions('UTC', {}, 'again').newId,
  })
  if (!isPlanEmpty(again)) violations.push('not idempotent after apply')
  return { holds: violations.length === 0, violations }
}

/**
 * Splits a scenario in time: the first half is organised and confirmed (all
 * stops locked), the second half arrives later as new photos.
 */
export function laterUpload(
  points: readonly HarnessPoint[],
  homeTz = 'UTC',
): OrganizeInput {
  const sorted = [...points].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const half = Math.ceil(sorted.length / 2)
  const first = sorted.slice(0, half)
  // Live Photo clips travel with their still.
  const firstIds = new Set(first.map((point) => point.id))
  const early = sorted.filter(
    (point) =>
      firstIds.has(point.id) ||
      (point.livePhotoOf !== undefined &&
        point.livePhotoOf !== null &&
        firstIds.has(point.livePhotoOf)),
  )
  const earlyIds = new Set(early.map((point) => point.id))
  const state = confirmedState(early, homeTz)
  return {
    ...state,
    media: [
      ...state.media,
      ...sorted
        .filter((point) => !earlyIds.has(point.id))
        .map((point) => toMedia(point)),
    ],
  }
}
