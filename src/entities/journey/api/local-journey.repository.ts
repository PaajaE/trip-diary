import {
  createJourneySchema,
  journeyDetailSchema,
  type CreateJourneyInput,
} from '@/entities/journey/model/journey'
import {
  localJourneySchema,
  type LocalJourney,
} from '@/entities/journey/model/local-journey'
import type { DashboardJourneyCard } from '@/entities/dashboard/model/dashboard'
import { localDb } from '@/shared/lib/local-db'
import { createPublicSlug } from '@/shared/lib/slug'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function createLocalJourney(
  creatorId: string,
  spaceId: string,
  input: CreateJourneyInput,
): Promise<string> {
  const validInput = createJourneySchema.parse(input)
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const draft = localJourneySchema.parse({
    createdAt: now,
    creatorId,
    endsAt: validInput.endsAt,
    id,
    slug: createPublicSlug(validInput.title, id),
    spaceId,
    startsAt: validInput.startsAt,
    summary: validInput.summary,
    syncStatus: 'pending',
    title: validInput.title,
    updatedAt: now,
  })
  const operation = syncOperationSchema.parse({
    createdAt: now,
    creatorId,
    id: crypto.randomUUID(),
    journeyId: id,
    status: 'pending',
    type: 'journey.create',
  })
  const snapshot = journeyDetailSchema.parse({
    endsAt: draft.endsAt,
    entries: [],
    guides: [],
    id: draft.id,
    stages: [],
    startsAt: draft.startsAt,
    status: 'planning',
    stops: [],
    spaceId: draft.spaceId,
    summary: draft.summary,
    title: draft.title,
  })

  await localDb.transaction(
    'rw',
    localDb.journeySnapshots,
    localDb.localJourneys,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneys.add(draft)
      await localDb.syncOperations.add(operation)
      await localDb.journeySnapshots.put({
        cachedAt: now,
        canContribute: true,
        journey: snapshot,
        journeyId: id,
      })
    },
  )

  return id
}

export async function getLocalJourney(
  journeyId: string,
): Promise<LocalJourney | null> {
  const draft = await localDb.localJourneys.get(journeyId)
  return draft === undefined ? null : localJourneySchema.parse(draft)
}

export async function listPendingLocalJourneys(
  userId: string,
): Promise<DashboardJourneyCard[]> {
  const drafts = await localDb.localJourneys
    .where('creatorId')
    .equals(userId)
    .filter((draft) => draft.syncStatus !== 'synced')
    .toArray()

  return drafts.map((draft) => ({
    endsAt: draft.endsAt,
    id: draft.id,
    role: 'owner' as const,
    startsAt: draft.startsAt,
    status: 'planning' as const,
    summary: draft.summary,
    syncStatus: toDashboardSyncStatus(draft.syncStatus),
    title: draft.title,
    updatedAt: draft.updatedAt,
    visibility: 'public' as const,
  }))
}

function toDashboardSyncStatus(
  syncStatus: LocalJourney['syncStatus'],
): DashboardJourneyCard['syncStatus'] {
  if (syncStatus === 'synced') {
    return undefined
  }
  return syncStatus
}
