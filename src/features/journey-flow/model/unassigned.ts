/**
 * Nezařazené (mockups M-Nezarazene, W-Nezarazene): the photos of a day that
 * belong to no stop, on the day's time axis, with group suggestions ("4
 * fotky z 12:40–12:50 · Nejspíš 6 · Sunwapta Falls, začíná o 10 minut
 * později" -> "Zařadit všechny 4", any photo can be left out) from the
 * existing `suggestStop` logic, and probable copies ("Podezřelé kopie") with
 * three ways out: copy to the trash, fix its time, keep both. The clock of a
 * photo is never changed automatically.
 */
import {
  suggestStop,
  type ProbableDuplicate,
  type StopSuggestion,
} from '@trip-diary/core/automation'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { FlowDay, FlowStop } from '@/features/journey-flow/model/flow-days'

/** Photos closer in time than this form one group. */
export const GROUP_MAX_GAP_MS = 15 * 60_000

export interface AxisPoint {
  /** 0..1 along the day's photo span; null without a capture time. */
  at: number | null
  item: MediaItem
  /** No GPS: these are why the photo stayed unplaced. */
  noLocation: boolean
}

export interface GroupSuggestion {
  /** Photos of the group in time order (all selected by default). */
  mediaIds: string[]
  /** Photos the suggested stop is the best guess for. */
  agreeing: number
  /** "začíná o 10 minut později": stop start minus the group's end (ms, negative = earlier). */
  offsetMs: number
  reason: StopSuggestion['reason']
  /** Number of the stop among the day's stops (rides excluded), null for a ride. */
  stopNumber: number | null
  stopId: string
  /** First and last capture instant of the group. */
  from: string
  to: string
}

export interface CopyPair {
  copy: MediaItem
  /** Seconds to add to the copy to land on the original ("Opravit čas"). */
  offsetSeconds: number
  original: MediaItem
}

export interface UnassignedModel {
  axis: { from: string | null; points: AxisPoint[]; to: string | null }
  copies: CopyPair[]
  /** Groups of unplaced photos with the stop they most likely belong to. */
  groups: GroupSuggestion[]
  /** Unplaced photos no stop is suggested for ("Jinam…"). */
  rest: string[]
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function stopsForSuggestion(stops: readonly FlowStop[]) {
  return stops.map((stop) => ({
    endsAt: stop.endsAt,
    id: stop.id,
    latitude: stop.centre?.latitude ?? null,
    longitude: stop.centre?.longitude ?? null,
    startsAt: stop.startsAt,
  }))
}

/**
 * Builds the Nezařazené view of a day. `deselected` photos (left out by the
 * user) stay in their group's `mediaIds` order but the caller assigns only
 * the selected ones (see `selectedOf`).
 */
export function buildUnassigned(
  day: FlowDay,
  /** Media of the whole journey: the original of a copy may be on another day. */
  lookup: ReadonlyMap<string, MediaItem> = new Map(
    day.media.map((item) => [item.id, item]),
  ),
): UnassignedModel {
  const times = day.media
    .map((item) =>
      item.capturedAt === null ? NaN : Date.parse(item.capturedAt),
    )
    .filter((value) => !Number.isNaN(value))
  const min = times.length === 0 ? null : Math.min(...times)
  const max = times.length === 0 ? null : Math.max(...times)
  const span = min === null || max === null ? 0 : max - min
  const points: AxisPoint[] = day.unassigned.map((item) => {
    const at = item.capturedAt === null ? NaN : Date.parse(item.capturedAt)
    return {
      at:
        Number.isNaN(at) || min === null
          ? null
          : span === 0
            ? 0
            : (at - min) / span,
      item,
      noLocation: item.latitude === null || item.longitude === null,
    }
  })

  // Groups of consecutive unplaced photos (time order, undated last).
  const dated = day.unassigned.filter((item) => item.capturedAt !== null)
  const groups: MediaItem[][] = []
  for (const item of dated) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    if (
      last !== undefined &&
      prev?.capturedAt != null &&
      item.capturedAt !== null &&
      Date.parse(item.capturedAt) - Date.parse(prev.capturedAt) <=
        GROUP_MAX_GAP_MS
    ) {
      last.push(item)
    } else {
      groups.push([item])
    }
  }

  const candidates = stopsForSuggestion(day.stops)
  const numberOf = new Map<string, number>()
  let n = 0
  for (const stop of day.stops) {
    if (stop.kind !== 'en_route') numberOf.set(stop.id, (n += 1))
  }
  const suggestions: GroupSuggestion[] = []
  const rest: string[] = day.unassigned
    .filter((item) => item.capturedAt === null)
    .map((item) => item.id)
  for (const group of groups) {
    const tally = new Map<
      string,
      { count: number; reason: StopSuggestion['reason'] }
    >()
    for (const item of group) {
      const hit = suggestStop(
        {
          capturedAt: item.capturedAt,
          latitude: item.latitude,
          longitude: item.longitude,
          momentId: item.momentId,
        },
        candidates,
      )
      if (hit === null) continue
      const known = tally.get(hit.stopId)
      if (known === undefined)
        tally.set(hit.stopId, { count: 1, reason: hit.reason })
      else known.count += 1
    }
    const best = [...tally.entries()].sort(
      (a, b) => b[1].count - a[1].count || cmp(a[0], b[0]),
    )[0]
    const first = group[0]
    const last = group[group.length - 1]
    const stop =
      best === undefined
        ? undefined
        : day.stops.find((entry) => entry.id === best[0])
    if (
      best === undefined ||
      stop === undefined ||
      first?.capturedAt == null ||
      last?.capturedAt == null
    ) {
      rest.push(...group.map((item) => item.id))
      continue
    }
    suggestions.push({
      agreeing: best[1].count,
      from: first.capturedAt,
      mediaIds: group.map((item) => item.id),
      offsetMs: Date.parse(stop.startsAt) - Date.parse(last.capturedAt),
      reason: best[1].reason,
      stopId: stop.id,
      stopNumber: numberOf.get(stop.id) ?? null,
      to: last.capturedAt,
    })
  }

  const copies = day.duplicates.flatMap((pair: ProbableDuplicate) => {
    const copy = lookup.get(pair.id)
    const original = lookup.get(pair.originalId)
    return copy === undefined || original === undefined
      ? []
      : [{ copy, offsetSeconds: pair.offsetSeconds, original }]
  })

  return {
    axis: {
      from: min === null ? null : new Date(min).toISOString(),
      points,
      to: max === null ? null : new Date(max).toISOString(),
    },
    copies,
    groups: suggestions,
    rest,
  }
}

/** The photos of a group that stay selected ("Výjimku odznač, zbytek se zařadí"). */
export function selectedOf(
  group: GroupSuggestion,
  deselected: ReadonlySet<string>,
): string[] {
  return group.mediaIds.filter((id) => !deselected.has(id))
}
