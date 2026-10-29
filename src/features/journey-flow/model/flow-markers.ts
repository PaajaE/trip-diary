/**
 * Client-side markers of the sorting flow (plan 4f, UX flow), per journey and
 * per device; nothing here is stored in the database:
 *   - which stops automatic runs created ("nová" badge),
 *   - per local day, up to which upload its arrivals were seen (Příjem),
 *   - which to-check stops the user opened (Kontrola).
 * Pure: schema, parsing and transitions. Storage is in api/flow-markers.store.
 */
import { z } from 'zod'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { Moment } from '@/entities/moment/model/moment'

/** Runs remembered for "nová" (older ones fall off). */
export const MAX_REMEMBERED_RUNS = 20
/** Opened stops remembered per journey. */
export const MAX_OPENED_STOPS = 2_000
/** Days with a seen marker remembered per journey (oldest drop off). */
export const MAX_SEEN_DAYS = 2_000

const instantSchema = z.iso.datetime({ offset: true })
const dayKeySchema = z.string().min(1).max(40)

const runsSchema = z
  .array(
    z.object({
      momentIds: z.array(z.uuid()),
      runId: z.string().min(1).max(100),
    }),
  )
  .max(MAX_REMEMBERED_RUNS)

const commonShape = {
  /** Copies the user decided to keep ("Nechat obě"): not offered again. */
  keptCopyIds: z.array(z.uuid()).max(MAX_OPENED_STOPS).default([]),
  /** To-check stops the user has opened (the "not opened yet" count). */
  openedStopIds: z.array(z.uuid()).max(MAX_OPENED_STOPS),
  /** Automatic runs whose stops are still "nová", oldest first. */
  runs: runsSchema,
}

export const flowMarkersSchema = z.object({
  ...commonShape,
  /**
   * Per local day key: the server instant (created_at of media and stops) up
   * to which that day's arrivals were seen. A day without an entry was never
   * seen (then it counts as new while it has unsorted photos). Acknowledging
   * one day never hides another one.
   */
  seenDays: z
    .record(dayKeySchema, instantSchema)
    .refine((days) => Object.keys(days).length <= MAX_SEEN_DAYS),
  version: z.literal(2),
})
export type FlowMarkers = z.infer<typeof flowMarkersSchema>

/**
 * Version 1 kept one journey-wide `seenUpTo` watermark. Confirming one day
 * moved it past other days' arrivals and hid them from Příjem, so it is not
 * carried over: those days count as never seen (shown again, never hidden).
 */
const flowMarkersV1Schema = z.object({
  ...commonShape,
  seenUpTo: instantSchema.nullable(),
  version: z.literal(1),
})

export const EMPTY_MARKERS: FlowMarkers = {
  keptCopyIds: [],
  openedStopIds: [],
  runs: [],
  seenDays: {},
  version: 2,
}

/** Stored value -> markers; version 1 is migrated, anything invalid is empty. */
export function parseFlowMarkers(value: unknown): FlowMarkers {
  const parsed = flowMarkersSchema.safeParse(value)
  if (parsed.success) return parsed.data
  const old = flowMarkersV1Schema.safeParse(value)
  if (!old.success) return EMPTY_MARKERS
  return {
    keptCopyIds: old.data.keptCopyIds,
    openedStopIds: old.data.openedStopIds,
    runs: old.data.runs,
    seenDays: {},
    version: 2,
  }
}

/** Remembers the stops one automatic run created. */
export function addRun(
  markers: FlowMarkers,
  runId: string,
  momentIds: readonly string[],
): FlowMarkers {
  if (momentIds.length === 0) return markers
  const runs = [
    ...markers.runs.filter((run) => run.runId !== runId),
    { momentIds: [...momentIds], runId },
  ].slice(-MAX_REMEMBERED_RUNS)
  return { ...markers, runs }
}

/** Forgets a run (it was undone: its stops are gone). */
export function forgetRun(markers: FlowMarkers, runId: string): FlowMarkers {
  if (!markers.runs.some((run) => run.runId === runId)) return markers
  return { ...markers, runs: markers.runs.filter((run) => run.runId !== runId) }
}

/** The instant up to which a day's arrivals were seen; null = never. */
export function seenUpToOf(
  markers: FlowMarkers,
  dayKey: string,
): string | null {
  return Object.hasOwn(markers.seenDays, dayKey)
    ? (markers.seenDays[dayKey] ?? null)
    : null
}

/**
 * The arrivals of one day are seen up to `seenUpTo` (see latestArrival): its
 * stops lose "nová". Other days keep their own marker and stay new.
 */
export function acknowledgeArrivals(
  markers: FlowMarkers,
  dayKey: string,
  seenUpTo: string | null,
  /** Stops of the day: they leave the remembered runs. */
  stopIds: readonly string[] = [],
): FlowMarkers {
  const drop = new Set(stopIds)
  const runs = markers.runs
    .map((run) => ({
      ...run,
      momentIds: run.momentIds.filter((id) => !drop.has(id)),
    }))
    .filter((run) => run.momentIds.length > 0)
  const previous = seenUpToOf(markers, dayKey)
  if (seenUpTo === null) {
    return drop.size === 0 ? markers : { ...markers, runs }
  }
  const entries = Object.entries(markers.seenDays).filter(
    ([key]) => key !== dayKey,
  )
  entries.push([dayKey, later(previous, seenUpTo)])
  // Oldest entries (insertion order) drop off beyond the cap.
  const seenDays = Object.fromEntries(entries.slice(-MAX_SEEN_DAYS))
  return { ...markers, runs, seenDays }
}

export function markStopOpened(
  markers: FlowMarkers,
  stopId: string,
): FlowMarkers {
  if (markers.openedStopIds.includes(stopId)) return markers
  return {
    ...markers,
    openedStopIds: [...markers.openedStopIds, stopId].slice(-MAX_OPENED_STOPS),
  }
}

/** "Nechat obě": the probable copy is a photo of its own. */
export function keepCopy(markers: FlowMarkers, copyId: string): FlowMarkers {
  if (markers.keptCopyIds.includes(copyId)) return markers
  return {
    ...markers,
    keptCopyIds: [...markers.keptCopyIds, copyId].slice(-MAX_OPENED_STOPS),
  }
}

function later(a: string | null, b: string): string {
  return a === null || Date.parse(b) > Date.parse(a) ? b : a
}

/**
 * The newest server instant of the journey (media uploads and stop rows):
 * what "seen up to now" means when the user acknowledges the arrivals.
 */
export function latestArrival(
  media: readonly Pick<MediaItem, 'createdAt'>[],
  moments: readonly Pick<Moment, 'createdAt'>[],
): string | null {
  let out: string | null = null
  for (const item of media) out = later(out, item.createdAt)
  for (const moment of moments) out = later(out, moment.createdAt)
  return out
}

/** Arrived after the marker (strictly); everything counts when never seen. */
export function arrivedAfter(createdAt: string, seenUpTo: string | null) {
  return seenUpTo === null || Date.parse(createdAt) > Date.parse(seenUpTo)
}

/**
 * "nová": an automatic, unlocked stop that a remembered run created, or
 * whose row is newer than its day's seen marker. A stop the user confirmed
 * or edited is not new any more.
 */
export function isNewStop(
  moment: Pick<Moment, 'createdAt' | 'id' | 'locked' | 'origin'>,
  markers: FlowMarkers,
  /** Local day of the stop (its seen marker); null when unknown. */
  dayKey: string | null,
  /** `newStopIds(markers)`, computed once by callers that check many stops. */
  ids: ReadonlySet<string> = newStopIds(markers),
): boolean {
  if (moment.origin !== 'auto' || moment.locked) return false
  if (ids.has(moment.id)) return true
  const seen = dayKey === null ? null : seenUpToOf(markers, dayKey)
  return seen !== null && arrivedAfter(moment.createdAt, seen)
}

/** Fast lookup of the stops remembered runs created. */
export function newStopIds(markers: FlowMarkers): Set<string> {
  return new Set(markers.runs.flatMap((run) => run.momentIds))
}
