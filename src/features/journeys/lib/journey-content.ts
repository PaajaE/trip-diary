import type { JourneyDetail } from '@/entities/journey/model/journey'
import {
  getMomentDayKey,
  UNDATED_DAY_KEY,
} from '@/features/journeys/lib/journey-stage-label'

export interface JourneyMoment {
  entry: JourneyDetail['entries'][number]
  location: {
    latitude: number
    longitude: number
  } | null
  stop: JourneyDetail['stops'][number] | null
}

export interface JourneyStageContent {
  dayKey: string | null
  moments: JourneyMoment[]
  plannedStops: JourneyDetail['stops']
  stage: JourneyDetail['stages'][number] | null
}

export function sortJourneyMomentsChronologically(
  moments: JourneyMoment[],
): JourneyMoment[] {
  return [...moments].sort((left, right) => {
    const leftTime =
      left.entry.eventAt === null
        ? Number.POSITIVE_INFINITY
        : new Date(left.entry.eventAt).getTime()
    const rightTime =
      right.entry.eventAt === null
        ? Number.POSITIVE_INFINITY
        : new Date(right.entry.eventAt).getTime()

    if (leftTime !== rightTime) {
      return leftTime - rightTime
    }

    return left.entry.id.localeCompare(right.entry.id)
  })
}

function sortDayKeys(left: string, right: string): number {
  if (left === UNDATED_DAY_KEY) {
    return 1
  }

  if (right === UNDATED_DAY_KEY) {
    return -1
  }

  return left.localeCompare(right)
}

export function composeJourneyContent(journey: JourneyDetail) {
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
    .sort(([left], [right]) => sortDayKeys(left, right))
    .map(([dayKey, dayMoments]) => ({
      dayKey,
      moments: sortJourneyMomentsChronologically(dayMoments),
      plannedStops: [],
      stage: null,
    }))

  const unassignedPlannedStops = plannedStops.filter((stop) =>
    isUnassignedStage(stop.stageId),
  )

  const stageContents: JourneyStageContent[] = [
    ...journey.stages.map((stage) => ({
      dayKey: null,
      moments: sortJourneyMomentsChronologically(
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
            moments: [],
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
