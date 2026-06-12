import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveLocalJourneyLink } from '@/entities/journey/api/local-journey-link.repository'
import { localDb } from '@/shared/lib/local-db'
import {
  STALE_SYNCING_OPERATION_MS,
  syncPendingOperations,
} from '@/shared/sync/sync.service'

const { getSupabaseClientMock } = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn(),
}))

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: getSupabaseClientMock,
}))

interface AssignmentRow {
  creator_id: string
  entry_id: string
  journey_id: string
  stage_id: string | null
  stop_id: string | null
}

function createAssignmentClient(input: {
  failingEntryIds?: Set<string>
  userId: string
}) {
  const assignments = new Map<string, AssignmentRow>()
  const upsert = vi.fn(
    (
      _name: string,
      args: {
        p_entry_id: string
        p_journey_id: string
        p_stage_id?: string
        p_stop_id?: string
      },
    ) => {
      if (input.failingEntryIds?.has(args.p_entry_id) === true) {
        return Promise.resolve({
          error: new Error(`Cannot sync ${args.p_entry_id}`),
        })
      }
      assignments.set(args.p_entry_id, {
        creator_id: input.userId,
        entry_id: args.p_entry_id,
        journey_id: args.p_journey_id,
        stage_id: args.p_stage_id ?? null,
        stop_id: args.p_stop_id ?? null,
      })
      return Promise.resolve({
        data: args.p_stop_id ?? null,
        error: null,
      })
    },
  )
  const query = {
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
  }
  let selectedEntryId = ''
  query.select.mockReturnValue(query)
  query.eq.mockImplementation((_column: string, entryId: string) => {
    selectedEntryId = entryId
    return query
  })
  query.single.mockImplementation(() =>
    Promise.resolve({
      data: assignments.get(selectedEntryId),
      error: assignments.has(selectedEntryId) ? null : new Error('Not found'),
    }),
  )

  return {
    assignments,
    client: {
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: input.userId } },
          }),
        ),
      },
      from: vi.fn(() => ({ ...query, upsert })),
      rpc: upsert,
    },
    upsert,
  }
}

describe('syncPendingOperations', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset()
  })

  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.journeyLinks.clear()
    await localDb.photos.clear()
    await localDb.photoVariants.clear()
    await localDb.syncOperations.clear()
  })

  it('syncs an offline assignment and removes its local overlay', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const stageId = crypto.randomUUID()
    const { assignments, client } = createAssignmentClient({ userId })
    getSupabaseClientMock.mockReturnValue(client)
    await saveLocalJourneyLink({
      creatorId: userId,
      entryId,
      journeyId,
      stageId,
      stopId: null,
    })

    await syncPendingOperations()

    expect(assignments.get(entryId)).toMatchObject({
      entry_id: entryId,
      journey_id: journeyId,
      stage_id: stageId,
    })
    await expect(localDb.journeyLinks.get(entryId)).resolves.toBeUndefined()
    await expect(localDb.syncOperations.count()).resolves.toBe(0)
  })

  it('recovers and retries an abandoned syncing assignment', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const { client, upsert } = createAssignmentClient({ userId })
    getSupabaseClientMock.mockReturnValue(client)
    await saveLocalJourneyLink({
      creatorId: userId,
      entryId,
      journeyId: crypto.randomUUID(),
      stageId: null,
      stopId: null,
    })
    const operation = await localDb.syncOperations.toCollection().first()
    expect(operation).toBeDefined()
    if (operation === undefined) {
      throw new Error('Expected an assignment operation')
    }
    await localDb.syncOperations.update(operation.id, {
      lastAttemptAt: new Date(
        Date.now() - STALE_SYNCING_OPERATION_MS - 1,
      ).toISOString(),
      status: 'syncing',
    })

    await syncPendingOperations()

    expect(upsert).toHaveBeenCalledOnce()
    await expect(localDb.syncOperations.count()).resolves.toBe(0)
  })

  it('syncs the offline location in the same assignment command', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const stopId = crypto.randomUUID()
    const { client, upsert } = createAssignmentClient({ userId })
    getSupabaseClientMock.mockReturnValue(client)
    await saveLocalJourneyLink({
      creatorId: userId,
      entryId,
      journeyId: crypto.randomUUID(),
      latitude: 51.18,
      locationTitle: 'Banff',
      longitude: -115.57,
      stageId: null,
      stopId,
    })

    await syncPendingOperations()

    expect(upsert).toHaveBeenCalledWith(
      'upsert_journey_moment_assignment',
      expect.objectContaining({
        p_entry_id: entryId,
        p_latitude: 51.18,
        p_location_title: 'Banff',
        p_longitude: -115.57,
        p_stop_id: stopId,
      }),
    )
  })

  it('continues with independent operations after one operation fails', async () => {
    const userId = crypto.randomUUID()
    const badEntryId = crypto.randomUUID()
    const goodEntryId = crypto.randomUUID()
    const failingEntryIds = new Set([badEntryId])
    const { assignments, client } = createAssignmentClient({
      failingEntryIds,
      userId,
    })
    getSupabaseClientMock.mockReturnValue(client)
    await saveLocalJourneyLink({
      creatorId: userId,
      entryId: badEntryId,
      journeyId: crypto.randomUUID(),
      stageId: null,
      stopId: null,
    })
    await saveLocalJourneyLink({
      creatorId: userId,
      entryId: goodEntryId,
      journeyId: crypto.randomUUID(),
      stageId: null,
      stopId: null,
    })

    await expect(syncPendingOperations()).rejects.toThrow(
      `Cannot sync ${badEntryId}`,
    )

    expect(assignments.has(goodEntryId)).toBe(true)
    await expect(localDb.journeyLinks.get(goodEntryId)).resolves.toBeUndefined()
    await expect(localDb.syncOperations.toArray()).resolves.toMatchObject([
      {
        entryId: badEntryId,
        status: 'failed',
        type: 'journey.assignment.upsert',
      },
    ])
  })
})
