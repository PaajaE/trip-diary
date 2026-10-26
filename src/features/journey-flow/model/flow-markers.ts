/**
 * Client-side markers of the sorting flow (plan 4f, UX flow), per journey and
 * per device; nothing here is stored in the database:
 *   - which stops automatic runs created ("nová" badge),
 *   - up to which upload the new arrivals were seen (Příjem),
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

const instantSchema = z.iso.datetime({ offset: true })

export const flowMarkersSchema = z.object({
  /** Copies the user decided to keep ("Nechat obě"): not offered again. */
  keptCopyIds: z.array(z.uuid()).max(MAX_OPENED_STOPS).default([]),
  /** To-check stops the user has opened (the "not opened yet" count). */
  openedStopIds: z.array(z.uuid()).max(MAX_OPENED_STOPS),
  /** Automatic runs since the arrivals were last seen, oldest first. */
  runs: z
    .array(
      z.object({
        momentIds: z.array(z.uuid()),
        runId: z.string().min(1).max(100),
      }),
    )
    .max(MAX_REMEMBERED_RUNS),
  /**
   * Server instant (created_at of media and stops) up to which the arrivals
   * were seen; null = never (then days with unsorted photos count as new).
   */
  seenUpTo: instantSchema.nullable(),
  version: z.literal(1),
})
export type FlowMarkers = z.infer<typeof flowMarkersSchema>

export const EMPTY_MARKERS: FlowMarkers = {
  keptCopyIds: [],
  openedStopIds: [],
  runs: [],
  seenUpTo: null,
  version: 1,
}

/** Stored value -> markers; anything invalid reads as empty. */
export function parseFlowMarkers(value: unknown): FlowMarkers {
  const parsed = flowMarkersSchema.safeParse(value)
  return parsed.success ? parsed.data : EMPTY_MARKERS
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

/** Arrivals seen up to `seenUpTo`: "nová" and the new days start over. */
export function acknowledgeArrivals(
  markers: FlowMarkers,
  seenUpTo: string | null,
): FlowMarkers {
  return { ...markers, runs: [], seenUpTo }
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
 * whose row is newer than the seen marker. A stop the user confirmed or
 * edited is not new any more.
 */
export function isNewStop(
  moment: Pick<Moment, 'createdAt' | 'id' | 'locked' | 'origin'>,
  markers: FlowMarkers,
): boolean {
  if (moment.origin !== 'auto' || moment.locked) return false
  if (markers.runs.some((run) => run.momentIds.includes(moment.id))) {
    return true
  }
  return (
    markers.seenUpTo !== null &&
    arrivedAfter(moment.createdAt, markers.seenUpTo)
  )
}

/** Fast lookup of the stops remembered runs created. */
export function newStopIds(markers: FlowMarkers): Set<string> {
  return new Set(markers.runs.flatMap((run) => run.momentIds))
}
