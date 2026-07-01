import {
  localNatureObservationSchema,
  natureObservationSchema,
  type LocalNatureObservation,
  type NatureObservation,
} from '@/entities/nature/model/observation'
import { localDb } from '@/shared/lib/local-db'

function toNatureObservation(item: LocalNatureObservation): NatureObservation {
  return natureObservationSchema.parse({
    category: item.category,
    checklistItemId: item.checklistItemId,
    commonName: item.commonName,
    confidence: item.confidence,
    entryId: item.entryId,
    externalId: item.externalId,
    externalSource: item.externalSource,
    id: item.id,
    journeyId: item.journeyId,
    latitude: item.latitude,
    longitude: item.longitude,
    notes: item.notes,
    observedAt: item.observedAt,
    photoId: item.photoId,
    scientificName: item.scientificName,
  })
}

export async function listLocalNatureObservations(
  journeyId: string,
): Promise<NatureObservation[]> {
  const items = await localDb.localNatureObservations
    .where('journeyId')
    .equals(journeyId)
    .reverse()
    .sortBy('updatedAt')
  return items.map(toNatureObservation)
}

export async function saveLocalNatureObservation(
  observation: LocalNatureObservation,
): Promise<void> {
  await localDb.localNatureObservations.put(
    localNatureObservationSchema.parse(observation),
  )
}
