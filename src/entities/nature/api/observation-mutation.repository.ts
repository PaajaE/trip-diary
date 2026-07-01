import {
  insertNatureObservationRemote,
  listJourneyObservationsRemote,
} from '@/entities/nature/api/observation.repository'
import {
  listLocalNatureObservations,
  saveLocalNatureObservation,
} from '@/entities/nature/api/local-observation.repository'
import {
  localNatureObservationSchema,
  natureObservationSchema,
  type NatureObservation,
} from '@/entities/nature/model/observation'
import { localDb } from '@/shared/lib/local-db'
import { isBrowserOnline } from '@/shared/lib/network'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

function mergeObservations(
  remote: NatureObservation[],
  local: NatureObservation[],
): NatureObservation[] {
  const merged = new Map<string, NatureObservation>()
  for (const item of remote) {
    merged.set(item.id, item)
  }
  for (const item of local) {
    merged.set(item.id, item)
  }
  return [...merged.values()].sort((left, right) => {
    const leftTime = left.observedAt ?? ''
    const rightTime = right.observedAt ?? ''
    return rightTime.localeCompare(leftTime)
  })
}

export async function listJourneyObservations(
  journeyId: string,
): Promise<NatureObservation[]> {
  const local = await listLocalNatureObservations(journeyId)

  if (!isBrowserOnline()) {
    return local
  }

  try {
    const remote = await listJourneyObservationsRemote(journeyId)
    return mergeObservations(remote, local)
  } catch {
    return local
  }
}

export async function createNatureObservation(input: {
  category: NatureObservation['category']
  checklistItemId?: string | null
  commonName: string
  confidence: NatureObservation['confidence']
  creatorId: string
  entryId?: string | null
  externalId?: string | null
  externalSource?: string | null
  journeyId: string
  latitude?: number | null
  longitude?: number | null
  notes?: string
  observedAt?: string | null
  photoId?: string | null
  scientificName?: string | null
}): Promise<NatureObservation> {
  const now = new Date().toISOString()
  const observation = natureObservationSchema.parse({
    category: input.category,
    checklistItemId: input.checklistItemId ?? null,
    commonName: input.commonName.trim(),
    confidence: input.confidence,
    entryId: input.entryId ?? null,
    externalId: input.externalId ?? null,
    externalSource: input.externalSource ?? null,
    id: crypto.randomUUID(),
    journeyId: input.journeyId,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    notes: input.notes?.trim() ?? '',
    observedAt: input.observedAt ?? now,
    photoId: input.photoId ?? null,
    scientificName: input.scientificName?.trim() ?? null,
  })

  if (isBrowserOnline()) {
    try {
      await insertNatureObservationRemote({
        category: observation.category,
        checklistItemId: observation.checklistItemId,
        commonName: observation.commonName,
        confidence: observation.confidence,
        creatorId: input.creatorId,
        entryId: observation.entryId,
        externalId: observation.externalId,
        externalSource: observation.externalSource,
        id: observation.id,
        journeyId: observation.journeyId,
        latitude: observation.latitude,
        longitude: observation.longitude,
        notes: observation.notes,
        observedAt: observation.observedAt,
        photoId: observation.photoId,
        scientificName: observation.scientificName,
      })
      return observation
    } catch {
      // Fall back to local queue below.
    }
  }

  const localObservation = localNatureObservationSchema.parse({
    ...observation,
    creatorId: input.creatorId,
    syncStatus: 'pending',
    updatedAt: now,
  })

  await localDb.transaction(
    'rw',
    localDb.localNatureObservations,
    localDb.syncOperations,
    async () => {
      await saveLocalNatureObservation(localObservation)
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId: input.creatorId,
          id: crypto.randomUUID(),
          journeyId: input.journeyId,
          observationId: observation.id,
          status: 'pending',
          type: 'observation.create',
        }),
      )
    },
  )

  return observation
}

export function observationsForPhoto(
  observations: NatureObservation[],
  photoId: string,
): NatureObservation[] {
  return observations.filter((observation) => observation.photoId === photoId)
}

export function observationsByCategory(
  observations: NatureObservation[],
): Map<NatureObservation['category'], NatureObservation[]> {
  const grouped = new Map<NatureObservation['category'], NatureObservation[]>()
  for (const observation of observations) {
    const current = grouped.get(observation.category) ?? []
    current.push(observation)
    grouped.set(observation.category, current)
  }
  return grouped
}
