import type {
  JourneyEntry,
  JourneyFullDetail,
  JourneyStage,
} from '@/features/journeys/model/journey-detail'
import type { JourneyStop } from '@trip-diary/core/journey'

export const UNDATED_DAY_KEY = 'undated' as const

export interface JourneyMoment {
  entry: JourneyEntry
  location: { latitude: number; longitude: number } | null
  stop: JourneyStop | null
}

export interface JourneyStageContent {
  dayKey: string | null
  moments: JourneyMoment[]
  plannedStops: JourneyStop[]
  stage: JourneyStage | null
}

export function getMomentDayKey(eventAt: string | null): string {
  if (eventAt === null) {
    return UNDATED_DAY_KEY
  }

  const date = new Date(eventAt)
  if (Number.isNaN(date.getTime())) {
    return UNDATED_DAY_KEY
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(year)}-${month}-${day}`
}

function timestampMs(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') {
    return null
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

function compareTimestampDesc(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftTime = timestampMs(left)
  const rightTime = timestampMs(right)

  if (leftTime === null && rightTime === null) {
    return 0
  }

  if (leftTime === null) {
    return 1
  }

  if (rightTime === null) {
    return -1
  }

  return rightTime - leftTime
}

/** Display order: event_at DESC, created_at DESC, id DESC. Nulls last. */
export function sortJourneyMomentsNewestFirst(
  moments: JourneyMoment[],
): JourneyMoment[] {
  return [...moments].sort((left, right) => {
    const byEvent = compareTimestampDesc(
      left.entry.eventAt,
      right.entry.eventAt,
    )
    if (byEvent !== 0) {
      return byEvent
    }

    const byCreated = compareTimestampDesc(
      left.entry.createdAt,
      right.entry.createdAt,
    )
    if (byCreated !== 0) {
      return byCreated
    }

    return right.entry.id.localeCompare(left.entry.id)
  })
}

/**
 * Oldest → newest by event_at (nulls last). Kept for map/route style ordering
 * if needed; UI lists should use sortJourneyMomentsNewestFirst.
 */
export function sortJourneyMomentsChronologically(
  moments: JourneyMoment[],
): JourneyMoment[] {
  return [...moments].sort((left, right) => {
    const leftTime = timestampMs(left.entry.eventAt)
    const rightTime = timestampMs(right.entry.eventAt)

    if (leftTime === null && rightTime === null) {
      return left.entry.id.localeCompare(right.entry.id)
    }

    if (leftTime === null) {
      return 1
    }

    if (rightTime === null) {
      return -1
    }

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    return left.entry.id.localeCompare(right.entry.id)
  })
}

function sortDayKeysNewestFirst(left: string, right: string): number {
  if (left === UNDATED_DAY_KEY) {
    return 1
  }

  if (right === UNDATED_DAY_KEY) {
    return -1
  }

  return right.localeCompare(left)
}

export function formatJourneyDayLabel(dayKey: string, locale: string): string {
  if (dayKey === UNDATED_DAY_KEY) {
    return dayKey
  }

  const [yearText, monthText, dayText] = dayKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return dayKey
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(
    new Date(year, month - 1, day),
  )
}

export function getJourneyStageContentLabel(
  content: JourneyStageContent,
  t: (key: string) => string,
  locale: string,
): string {
  if (content.stage !== null) {
    return content.stage.title
  }

  if (content.dayKey === UNDATED_DAY_KEY) {
    return t('journey.undatedMoments')
  }

  if (content.dayKey !== null) {
    return formatJourneyDayLabel(content.dayKey, locale)
  }

  return t('journey.unassignedPlaces')
}

export function composeJourneyContent(journey: JourneyFullDetail) {
  const stopsById = new Map(journey.stops.map((stop) => [stop.id, stop]))
  const linkedStopIds = new Set(
    journey.entries
      .map((entry) => entry.stopId)
      .filter((stopId): stopId is string => stopId !== null),
  )
  const moments = journey.entries.map((entry): JourneyMoment => {
    const stop =
      entry.stopId === null ? null : (stopsById.get(entry.stopId) ?? null)
    const latitude = stop?.mapLatitude
    const longitude = stop?.mapLongitude
    const hasLocation =
      latitude !== null &&
      latitude !== undefined &&
      longitude !== null &&
      longitude !== undefined &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)

    return {
      entry,
      location: hasLocation ? { latitude, longitude } : null,
      stop,
    }
  })
  const plannedStops = journey.stops.filter(
    (stop) => !linkedStopIds.has(stop.id),
  )
  const validStageIds = new Set(journey.stages.map((stage) => stage.id))
  const isUnassignedStage = (stageId: string | null) =>
    stageId === null || !validStageIds.has(stageId)

  const unassignedMoments = moments.filter((moment) =>
    isUnassignedStage(moment.entry.stageId),
  )
  const momentsByDay = new Map<string, JourneyMoment[]>()

  for (const moment of unassignedMoments) {
    const dayKey = getMomentDayKey(moment.entry.eventAt)
    const bucket = momentsByDay.get(dayKey) ?? []
    bucket.push(moment)
    momentsByDay.set(dayKey, bucket)
  }

  const dayGroups: JourneyStageContent[] = [...momentsByDay.entries()]
    .sort(([left], [right]) => sortDayKeysNewestFirst(left, right))
    .map(([dayKey, dayMoments]) => ({
      dayKey,
      moments: sortJourneyMomentsNewestFirst(dayMoments),
      plannedStops: [],
      stage: null,
    }))

  const unassignedPlannedStops = plannedStops.filter((stop) =>
    isUnassignedStage(stop.stageId),
  )

  const stageContents: JourneyStageContent[] = [
    ...journey.stages.map((stage) => ({
      dayKey: null,
      moments: sortJourneyMomentsNewestFirst(
        moments.filter((moment) => moment.entry.stageId === stage.id),
      ),
      plannedStops: plannedStops.filter((stop) => stop.stageId === stage.id),
      stage,
    })),
    ...dayGroups,
    ...(unassignedPlannedStops.length > 0
      ? [
          {
            dayKey: null,
            moments: [] as JourneyMoment[],
            plannedStops: unassignedPlannedStops,
            stage: null,
          },
        ]
      : []),
  ].filter(
    (content) =>
      content.moments.length > 0 ||
      content.plannedStops.length > 0 ||
      content.stage !== null,
  )

  return {
    locatedMomentCount: moments.filter((moment) => moment.location !== null)
      .length,
    moments,
    plannedStops,
    stageContents,
  }
}
