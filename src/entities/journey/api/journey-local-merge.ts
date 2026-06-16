import {
  journeyDetailSchema,
  type JourneyDetail,
} from '@/entities/journey/model/journey'
import { listLocalJourneyLinks } from '@/entities/journey/api/local-journey-link.repository'
import { localDb } from '@/shared/lib/local-db'

function sortEntriesByEventAt(
  left: JourneyDetail['entries'][number],
  right: JourneyDetail['entries'][number],
): number {
  const leftTime = left.eventAt === null ? 0 : new Date(left.eventAt).valueOf()
  const rightTime =
    right.eventAt === null ? 0 : new Date(right.eventAt).valueOf()
  return rightTime - leftTime
}

export async function applyLocalJourneyDeltas(
  journey: JourneyDetail,
): Promise<JourneyDetail> {
  const localLinks = await listLocalJourneyLinks(journey.id)
  const knownEntryIds = new Set(journey.entries.map((entry) => entry.id))
  const knownStopIds = new Set(journey.stops.map((stop) => stop.id))
  const localOnlyEntryIds = localLinks
    .map((link) => link.entryId)
    .filter((entryId) => !knownEntryIds.has(entryId))

  const localEntries =
    localOnlyEntryIds.length === 0
      ? []
      : await localDb.entries.where('id').anyOf(localOnlyEntryIds).toArray()

  const localLinksByEntryId = new Map(
    localLinks.map((link) => [link.entryId, link]),
  )

  const newEntries = localEntries.map((entry) => {
    const link = localLinksByEntryId.get(entry.id)
    return {
      body: entry.body,
      eventAt: entry.eventAt,
      id: entry.id,
      stageId: link?.stageId ?? null,
      stopId: link?.stopId ?? null,
      title: entry.title,
      type: entry.type,
    }
  })

  const newStops = localLinks.flatMap((link) =>
    link.stopId === null ||
    !Number.isFinite(link.latitude) ||
    !Number.isFinite(link.longitude) ||
    knownStopIds.has(link.stopId)
      ? []
      : [
          {
            id: link.stopId,
            mapLatitude: link.latitude ?? null,
            mapLongitude: link.longitude ?? null,
            notes: '',
            stageId: link.stageId,
            status: 'visited' as const,
            title: link.locationTitle ?? '',
          },
        ],
  )

  if (newEntries.length === 0 && newStops.length === 0) {
    return journey
  }

  return journeyDetailSchema.parse({
    ...journey,
    entries: [...journey.entries, ...newEntries].sort(sortEntriesByEventAt),
    stops: [...journey.stops, ...newStops],
  })
}
