import type {
  PublicJourney,
  PublicMedia,
  PublicMoment,
  PublicPlace,
  PublicSegment,
  PublicTrack,
} from '@trip-diary/core/public-journey'

export const STAGE_COLORS = [
  '#285943',
  '#b85f42',
  '#3b6ea5',
  '#8a5a9e',
  '#c49a2c',
  '#2c8a8a',
  '#a33b5c',
  '#5f7a2c',
] as const

/** One calendar day of a stage: its moments plus the author's day note. */
export interface JourneyDay {
  /** Local calendar day (YYYY-MM-DD) in the stage's zone. */
  key: string
  /** 1-based day number counted from the first day of the journey. */
  number: number
  moments: PublicMoment[]
  note: string | null
}

export interface JourneyModel {
  data: PublicJourney
  /** Day note body by local date (YYYY-MM-DD). */
  dayNoteByDate: Map<string, string>
  /** Local day key of an instant, in the zone of the segment (else home zone, else UTC). */
  dayKeyOf: (iso: string, segment: PublicSegment | null) => string
  /** Days of a stage with moments (nested trips included), chronological. */
  daysOfStage: (stageId: string) => JourneyDay[]
  mediaById: Map<string, PublicMedia>
  /** Media per moment, starred first, then capture time. */
  mediaByMoment: Map<string, PublicMedia[]>
  momentById: Map<string, PublicMoment>
  /** Moments in chronological order. */
  moments: PublicMoment[]
  placeById: Map<string, PublicPlace>
  segmentById: Map<string, PublicSegment>
  stages: PublicSegment[]
  /** Deepest segment (by time span) that contains the instant. */
  segmentOfInstant: (iso: string) => PublicSegment | null
  /** Root stage of a segment (itself for stages). */
  stageOf: (segmentId: string) => PublicSegment | null
  stageColor: (segmentId: string) => string
  tracksBySegment: Map<string, PublicTrack[]>
  /** Direct children of a segment, chronological. */
  childrenOf: (segmentId: string) => PublicSegment[]
  /** Trips that belong to the stage (any depth), chronological. */
  tripsOfStage: (stageId: string) => PublicSegment[]
  /** Moments that sit directly in this segment (not in a deeper one). */
  momentsOfSegment: (segmentId: string) => PublicMoment[]
  /** All moments inside the segment's time span, including nested trips. */
  momentsInSpan: (segmentId: string) => PublicMoment[]
  /** Media of the moments in span plus time-matched unassigned media. */
  mediaInSpan: (segmentId: string) => PublicMedia[]
}

const ms = (iso: string) => Date.parse(iso)

function byStart(a: { startsAt: string }, b: { startsAt: string }) {
  return ms(a.startsAt) - ms(b.startsAt)
}

export function buildJourneyModel(data: PublicJourney): JourneyModel {
  const segmentById = new Map(data.segments.map((s) => [s.id, s]))
  const mediaById = new Map(data.media.map((m) => [m.id, m]))
  const momentById = new Map(data.moments.map((m) => [m.id, m]))
  const placeById = new Map(data.places.map((p) => [p.id, p]))
  const moments = [...data.moments].sort(byStart)

  const stages = data.segments
    .filter((s) => s.kind === 'stage')
    .sort((a, b) => a.position - b.position || byStart(a, b))

  const mediaByMoment = new Map<string, PublicMedia[]>()
  for (const item of data.media) {
    if (item.momentId === null) continue
    const list = mediaByMoment.get(item.momentId) ?? []
    list.push(item)
    mediaByMoment.set(item.momentId, list)
  }
  for (const list of mediaByMoment.values()) {
    list.sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) ||
        ms(a.capturedAt ?? '1970-01-01T00:00:00Z') -
          ms(b.capturedAt ?? '1970-01-01T00:00:00Z'),
    )
  }

  const tracksBySegment = new Map<string, PublicTrack[]>()
  for (const track of data.tracks) {
    const list = tracksBySegment.get(track.segmentId) ?? []
    list.push(track)
    tracksBySegment.set(track.segmentId, list)
  }

  const childrenByParent = new Map<string, PublicSegment[]>()
  for (const s of data.segments) {
    if (s.parentId === null) continue
    const list = childrenByParent.get(s.parentId) ?? []
    list.push(s)
    childrenByParent.set(s.parentId, list)
  }
  for (const list of childrenByParent.values()) list.sort(byStart)

  const spanSorted = [...data.segments].sort(
    (a, b) => ms(a.endsAt) - ms(a.startsAt) - (ms(b.endsAt) - ms(b.startsAt)),
  )

  const segmentOfInstant = (iso: string): PublicSegment | null => {
    const t = ms(iso)
    return (
      spanSorted.find((s) => ms(s.startsAt) <= t && t <= ms(s.endsAt)) ?? null
    )
  }

  const stageOf = (segmentId: string): PublicSegment | null => {
    let current = segmentById.get(segmentId)
    for (let i = 0; i < 16 && current !== undefined; i += 1) {
      if (current.kind === 'stage' && current.parentId === null) return current
      if (current.parentId === null) {
        // Orphan trip: fall back to the stage that contains its start.
        return (
          stages.find(
            (s) =>
              current !== undefined &&
              ms(s.startsAt) <= ms(current.startsAt) &&
              ms(current.startsAt) <= ms(s.endsAt),
          ) ?? null
        )
      }
      current = segmentById.get(current.parentId)
    }
    return null
  }

  const colorIndex = new Map(stages.map((s, i) => [s.id, i]))
  const stageColor = (segmentId: string): string => {
    const stage = stageOf(segmentId)
    const index = stage === null ? 0 : colorIndex.get(stage.id)
    return STAGE_COLORS[(index ?? 0) % STAGE_COLORS.length] ?? STAGE_COLORS[0]
  }

  const tripsOfStage = (stageId: string): PublicSegment[] =>
    data.segments
      .filter((s) => s.kind === 'trip' && stageOf(s.id)?.id === stageId)
      .sort(byStart)

  const momentsOfSegment = (segmentId: string): PublicMoment[] =>
    moments.filter((m) => segmentOfInstant(m.startsAt)?.id === segmentId)

  const momentsInSpan = (segmentId: string): PublicMoment[] => {
    const seg = segmentById.get(segmentId)
    if (seg === undefined) return []
    return moments.filter(
      (m) =>
        ms(seg.startsAt) <= ms(m.startsAt) && ms(m.startsAt) <= ms(seg.endsAt),
    )
  }

  const mediaInSpan = (segmentId: string): PublicMedia[] => {
    const seg = segmentById.get(segmentId)
    if (seg === undefined) return []
    return data.media.filter((item) => {
      if (item.segmentOverrideId !== null)
        return item.segmentOverrideId === segmentId
      const iso =
        item.momentId === null
          ? item.capturedAt
          : (momentById.get(item.momentId)?.startsAt ?? item.capturedAt)
      if (iso === null) return false
      return ms(seg.startsAt) <= ms(iso) && ms(iso) <= ms(seg.endsAt)
    })
  }

  const zoneFor = (segment: PublicSegment | null) =>
    segment?.tz ?? data.journey.homeTz ?? 'UTC'
  const dayKeyOf = (iso: string, segment: PublicSegment | null): string =>
    localDayKey(iso, zoneFor(segment))

  const dayNoteByDate = new Map(data.dayNotes.map((n) => [n.date, n.body]))

  // Day numbers run over the whole journey, each moment in its stage's zone.
  const firstDayKey = moments.reduce<string | null>((first, m) => {
    const owner = segmentOfInstant(m.startsAt)
    const key = dayKeyOf(m.startsAt, owner === null ? null : stageOf(owner.id))
    return first === null || key < first ? key : first
  }, null)

  const daysOfStage = (stageId: string): JourneyDay[] => {
    const stage = segmentById.get(stageId)
    if (stage === undefined) return []
    const byKey = new Map<string, PublicMoment[]>()
    for (const m of momentsInSpan(stageId)) {
      const key = dayKeyOf(m.startsAt, stage)
      const list = byKey.get(key) ?? []
      list.push(m)
      byKey.set(key, list)
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, list]) => ({
        key,
        moments: list,
        note: dayNoteByDate.get(key) ?? null,
        number:
          firstDayKey === null
            ? 1
            : Math.round(
                (Date.parse(`${key}T00:00:00Z`) -
                  Date.parse(`${firstDayKey}T00:00:00Z`)) /
                  86_400_000,
              ) + 1,
      }))
  }

  return {
    dayKeyOf,
    dayNoteByDate,
    daysOfStage,
    childrenOf: (id) => childrenByParent.get(id) ?? [],
    data,
    mediaById,
    mediaByMoment,
    mediaInSpan,
    momentById,
    moments,
    momentsInSpan,
    momentsOfSegment,
    placeById,
    segmentById,
    segmentOfInstant,
    stageColor,
    stageOf,
    stages,
    tracksBySegment,
    tripsOfStage,
  }
}

/** Calendar day (YYYY-MM-DD) of an instant in an IANA zone. */
export function localDayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatInZone(
  iso: string,
  timeZone: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
    new Date(iso),
  )
}

/** Zone for a segment/moment: its own, else the journey home zone, else UTC. */
export function zoneOf(
  model: JourneyModel,
  segment: Pick<PublicSegment, 'tz'> | null,
): string {
  return segment?.tz ?? model.data.journey.homeTz ?? 'UTC'
}

/** Coverage image of a segment/moment/journey: explicit cover, else first starred. */
export function pickCover(
  model: JourneyModel,
  coverMediaId: string | null,
  fallback: PublicMedia[],
): PublicMedia | null {
  if (coverMediaId !== null) {
    const found = model.mediaById.get(coverMediaId)
    if (found !== undefined) return found
  }
  return fallback.find((m) => m.starred) ?? fallback[0] ?? null
}
