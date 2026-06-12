import { localJourneyLinkSchema } from '@/entities/journey/model/local-journey-link'
import { localDb } from '@/shared/lib/local-db'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function saveLocalJourneyLink(input: {
  creatorId: string
  entryId: string
  journeyId: string
  latitude?: number | null
  locationTitle?: string | null
  longitude?: number | null
  stageId: string | null
  stopId: string | null
}): Promise<void> {
  const now = new Date().toISOString()
  const operationId = crypto.randomUUID()
  const link = localJourneyLinkSchema.parse({
    createdAt: now,
    creatorId: input.creatorId,
    entryId: input.entryId,
    journeyId: input.journeyId,
    latitude: input.latitude ?? null,
    locationTitle: input.locationTitle ?? null,
    longitude: input.longitude ?? null,
    stageId: input.stageId,
    stopId: input.stopId,
    syncOperationId: operationId,
  })
  const operation = syncOperationSchema.parse({
    ...link,
    id: operationId,
    status: 'pending',
    type: 'journey.assignment.upsert',
  })

  await localDb.transaction(
    'rw',
    localDb.journeyLinks,
    localDb.syncOperations,
    async () => {
      await localDb.journeyLinks.put(link)
      await localDb.syncOperations
        .filter(
          (candidate) =>
            candidate.type === 'journey.assignment.upsert' &&
            candidate.entryId === input.entryId,
        )
        .delete()
      await localDb.syncOperations.add(operation)
    },
  )
}

export async function listLocalJourneyLinks(journeyId: string) {
  return localDb.journeyLinks.where('journeyId').equals(journeyId).toArray()
}
