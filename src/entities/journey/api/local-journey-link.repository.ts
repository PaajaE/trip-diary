import { localJourneyLinkSchema } from '@/entities/journey/model/local-journey-link'
import { localDb } from '@/shared/lib/local-db'

export async function saveLocalJourneyLink(input: {
  creatorId: string
  entryId: string
  journeyId: string
  stageId: string | null
  stopId: string | null
}): Promise<void> {
  await localDb.journeyLinks.put(
    localJourneyLinkSchema.parse({
      createdAt: new Date().toISOString(),
      creatorId: input.creatorId,
      entryId: input.entryId,
      journeyId: input.journeyId,
      stageId: input.stageId,
      stopId: input.stopId,
    }),
  )
}

export async function listLocalJourneyLinks(journeyId: string) {
  return localDb.journeyLinks.where('journeyId').equals(journeyId).toArray()
}
