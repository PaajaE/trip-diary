import { z } from 'zod'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import {
  journeyDetailSchema,
  type JourneyDetail,
} from '@/entities/journey/model/journey'
import { natureObservationSchema } from '@/entities/nature/model/observation'
import type { NatureObservation } from '@/entities/nature/model/observation'
import { localDb, type JourneySnapshotRecord } from '@/shared/lib/local-db'

const journeySnapshotSchema = z.object({
  cachedAt: z.iso.datetime({ offset: true }),
  canContribute: z.boolean(),
  checklistItems: z.array(
    z.object({
      category: z.enum(['wildlife', 'flora', 'geology', 'landmark', 'general']),
      checkedAt: z.iso.datetime({ offset: true }).nullable(),
      entryId: z.uuid().nullable(),
      id: z.uuid(),
      itemSlug: z.string(),
      notes: z.string(),
      position: z.number().int().nonnegative(),
      stopId: z.uuid().nullable(),
      templateSlug: z.string(),
      title: z.string(),
    }),
  ),
  journey: journeyDetailSchema,
  journeyId: z.uuid(),
  observations: z.array(natureObservationSchema),
})

export type { JourneySnapshotRecord }

type LegacyJourneySnapshotRecord = Omit<
  JourneySnapshotRecord,
  'checklistItems' | 'observations'
> & {
  checklistItems?: JourneyChecklistItem[]
  observations?: NatureObservation[]
}

export async function saveJourneySnapshot(
  journey: JourneyDetail,
  canContribute: boolean,
  extras: {
    checklistItems?: JourneyChecklistItem[]
    observations?: NatureObservation[]
  } = {},
): Promise<void> {
  const existing = (await localDb.journeySnapshots.get(journey.id)) as
    | LegacyJourneySnapshotRecord
    | undefined
  await localDb.journeySnapshots.put(
    journeySnapshotSchema.parse({
      cachedAt: new Date().toISOString(),
      canContribute,
      checklistItems: extras.checklistItems ?? existing?.checklistItems ?? [],
      journey,
      journeyId: journey.id,
      observations: extras.observations ?? existing?.observations ?? [],
    }),
  )
}

export async function getJourneySnapshot(
  journeyId: string,
): Promise<JourneySnapshotRecord | null> {
  const snapshot = (await localDb.journeySnapshots.get(journeyId)) as
    | LegacyJourneySnapshotRecord
    | undefined
  if (snapshot === undefined) {
    return null
  }
  return journeySnapshotSchema.parse({
    ...snapshot,
    checklistItems: snapshot.checklistItems ?? [],
    observations: snapshot.observations ?? [],
  })
}

export async function getJourneySnapshotChecklist(
  journeyId: string,
): Promise<JourneyChecklistItem[] | null> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null || snapshot.checklistItems.length === 0) {
    return null
  }
  return snapshot.checklistItems
}

export async function getJourneySnapshotObservations(
  journeyId: string,
): Promise<NatureObservation[] | null> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null || snapshot.observations.length === 0) {
    return null
  }
  return snapshot.observations
}

export async function removeChecklistItemsFromSnapshot(
  journeyId: string,
  itemIds: string[],
): Promise<void> {
  const snapshot = (await localDb.journeySnapshots.get(journeyId)) as
    | LegacyJourneySnapshotRecord
    | undefined
  if (snapshot === undefined || itemIds.length === 0) {
    return
  }

  const removedIds = new Set(itemIds)
  await localDb.journeySnapshots.put(
    journeySnapshotSchema.parse({
      ...snapshot,
      cachedAt: new Date().toISOString(),
      checklistItems: (snapshot.checklistItems ?? []).filter(
        (item) => !removedIds.has(item.id),
      ),
      observations: snapshot.observations ?? [],
    }),
  )
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
