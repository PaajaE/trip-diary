import { z } from 'zod'
import {
  journeyDetailSchema,
  type JourneyDetail,
} from '@/entities/journey/model/journey'
import { localDb } from '@/shared/lib/local-db'

const journeySnapshotSchema = z.object({
  cachedAt: z.iso.datetime({ offset: true }),
  canContribute: z.boolean(),
  journey: journeyDetailSchema,
  journeyId: z.uuid(),
})

export type JourneySnapshotRecord = z.infer<typeof journeySnapshotSchema>

export async function saveJourneySnapshot(
  journey: JourneyDetail,
  canContribute: boolean,
): Promise<void> {
  await localDb.journeySnapshots.put(
    journeySnapshotSchema.parse({
      cachedAt: new Date().toISOString(),
      canContribute,
      journey,
      journeyId: journey.id,
    }),
  )
}

export async function getJourneySnapshot(
  journeyId: string,
): Promise<JourneySnapshotRecord | null> {
  const snapshot = await localDb.journeySnapshots.get(journeyId)
  if (snapshot === undefined) {
    return null
  }
  return journeySnapshotSchema.parse(snapshot)
}

export async function updateJourneySnapshotContribution(
  journeyId: string,
  canContribute: boolean,
): Promise<void> {
  const snapshot = await localDb.journeySnapshots.get(journeyId)
  if (snapshot === undefined) {
    return
  }
  await localDb.journeySnapshots.update(journeyId, {
    cachedAt: new Date().toISOString(),
    canContribute,
  })
}
