import type { JourneyDetail } from '@/entities/journey/model/journey'

export interface JourneyMoment {
  entry: JourneyDetail['entries'][number]
  location: {
    latitude: number
    longitude: number
  } | null
  stop: JourneyDetail['stops'][number] | null
}

export interface JourneyStageContent {
  moments: JourneyMoment[]
  plannedStops: JourneyDetail['stops']
  stage: JourneyDetail['stages'][number] | null
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
  const unassignedMoments = moments.filter(
    (moment) =>
      moment.entry.stageId === null || !validStageIds.has(moment.entry.stageId),
  )
  const unassignedPlannedStops = plannedStops.filter(
    (stop) => stop.stageId === null || !validStageIds.has(stop.stageId),
  )
  const stageContents: JourneyStageContent[] = [
    ...journey.stages.map((stage) => ({
      moments: moments.filter((moment) => moment.entry.stageId === stage.id),
      plannedStops: plannedStops.filter((stop) => stop.stageId === stage.id),
      stage,
    })),
    {
      moments: unassignedMoments,
      plannedStops: unassignedPlannedStops,
      stage: null,
    },
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
