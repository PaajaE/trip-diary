import {
  createJourneySchema,
  journeyDetailSchema,
  type CreateJourneyInput,
} from '@/entities/journey/model/journey'
import { getLocalJourney } from '@/entities/journey/api/local-journey.repository'
import {
  getJourneySnapshot,
  saveJourneySnapshot,
} from '@/entities/journey/api/local-journey-cache.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import {
  clearDeletedRecord,
  isRecordDeleted,
  markDeletedRecord,
} from '@/shared/lib/local-deleted-records'
import { isBrowserOnline } from '@/shared/lib/network'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function updateJourney(
  journeyId: string,
  creatorId: string,
  input: CreateJourneyInput,
): Promise<void> {
  const validInput = createJourneySchema.parse(input)
  if (await isRecordDeleted('journey', journeyId)) {
    throw new Error('Journey is unavailable')
  }

  const localDraft = await getLocalJourney(journeyId)
  if (localDraft !== null) {
    await updateLocalJourneyDraft(journeyId, validInput)
    return
  }

  if (!isBrowserOnline()) {
    await queueJourneyUpdate(journeyId, creatorId, validInput)
    return
  }

  try {
    await updateJourneyOnRemote(journeyId, validInput)
    await patchCachedJourney(journeyId, validInput)
  } catch {
    await queueJourneyUpdate(journeyId, creatorId, validInput)
  }
}

export async function deleteJourney(
  journeyId: string,
  creatorId: string,
): Promise<void> {
  if (await isRecordDeleted('journey', journeyId)) {
    return
  }

  const localDraft = await getLocalJourney(journeyId)
  if (localDraft !== null && localDraft.syncStatus === 'pending') {
    await purgeLocalJourneyArtifacts(journeyId)
    return
  }

  if (!isBrowserOnline()) {
    await queueJourneyDelete(journeyId, creatorId)
    return
  }

  try {
    await deleteJourneyOnRemote(journeyId)
    await purgeLocalJourneyArtifacts(journeyId)
    await clearDeletedRecord(journeyId)
  } catch {
    await queueJourneyDelete(journeyId, creatorId)
  }
}

async function updateLocalJourneyDraft(
  journeyId: string,
  input: CreateJourneyInput,
): Promise<void> {
  const now = new Date().toISOString()
  const draft = await getLocalJourney(journeyId)
  if (draft === null) {
    throw new Error('Journey not found')
  }

  await localDb.transaction(
    'rw',
    localDb.journeySnapshots,
    localDb.localJourneys,
    async () => {
      await localDb.localJourneys.update(journeyId, {
        endsAt: input.endsAt,
        startsAt: input.startsAt,
        summary: input.summary,
        title: input.title,
        updatedAt: now,
      })
      const snapshot = await localDb.journeySnapshots.get(journeyId)
      if (snapshot !== undefined) {
        await localDb.journeySnapshots.put({
          ...snapshot,
          cachedAt: now,
          journey: journeyDetailSchema.parse({
            ...snapshot.journey,
            endsAt: input.endsAt,
            startsAt: input.startsAt,
            summary: input.summary,
            title: input.title,
          }),
        })
      }
    },
  )
}

async function queueJourneyUpdate(
  journeyId: string,
  creatorId: string,
  input: CreateJourneyInput,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction(
    'rw',
    localDb.journeySnapshots,
    localDb.syncOperations,
    async () => {
      await patchCachedJourney(journeyId, input)
      await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'journey.update' &&
            operation.journeyId === journeyId,
        )
        .delete()
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId,
          id: crypto.randomUUID(),
          journeyId,
          status: 'pending',
          type: 'journey.update',
        }),
      )
    },
  )
}

async function queueJourneyDelete(
  journeyId: string,
  creatorId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.syncOperations,
    async () => {
      await markDeletedRecord({
        creatorId,
        deletedAt: now,
        id: journeyId,
        kind: 'journey',
      })
      await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'journey.update' &&
            operation.journeyId === journeyId,
        )
        .delete()
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId,
          id: crypto.randomUUID(),
          journeyId,
          status: 'pending',
          type: 'journey.delete',
        }),
      )
    },
  )
}

async function patchCachedJourney(
  journeyId: string,
  input: CreateJourneyInput,
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      endsAt: input.endsAt,
      startsAt: input.startsAt,
      summary: input.summary,
      title: input.title,
    }),
    snapshot.canContribute,
  )
}

async function updateJourneyOnRemote(
  journeyId: string,
  input: CreateJourneyInput,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journeys')
    .update({
      ends_at: input.endsAt,
      starts_at: input.startsAt,
      summary: input.summary,
      title: input.title,
    })
    .eq('id', journeyId)

  if (error !== null) {
    throw error
  }
}

async function deleteJourneyOnRemote(journeyId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journeys')
    .delete()
    .eq('id', journeyId)

  if (error !== null) {
    throw error
  }
}

async function purgeLocalJourneyArtifacts(journeyId: string): Promise<void> {
  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.journeySnapshots,
    localDb.localJourneys,
    localDb.syncOperations,
    async () => {
      await localDb.deletedRecords.delete(journeyId)
      await localDb.journeySnapshots.delete(journeyId)
      await localDb.localJourneys.delete(journeyId)
      await localDb.syncOperations
        .filter((operation) => operationMatchesJourney(operation, journeyId))
        .delete()
    },
  )
}

function operationMatchesJourney(
  operation: { type: string } & Record<string, unknown>,
  journeyId: string,
): boolean {
  return 'journeyId' in operation && operation.journeyId === journeyId
}
