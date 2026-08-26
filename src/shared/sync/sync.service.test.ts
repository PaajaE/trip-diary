import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveLocalJourneyLink } from '@/entities/journey/api/local-journey-link.repository'
import { localDb } from '@/shared/lib/local-db'
import { syncOperationSchema } from '@/shared/sync/sync-operation'
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
        getSession: vi.fn(() =>
          Promise.resolve({
            data: { session: { user: { id: input.userId } } },
          }),
        ),
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
    await localDb.journeySnapshots.clear()
    await localDb.localJourneys.clear()
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

  it('syncs an offline journey draft and removes its outbox operation', async () => {
    const userId = crypto.randomUUID()
    const spaceId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const now = new Date().toISOString()
    const journeys = new Map<string, Record<string, unknown>>()

    getSupabaseClientMock.mockReturnValue({
      auth: {
        getSession: vi.fn(() =>
          Promise.resolve({
            data: { session: { user: { id: userId } } },
          }),
        ),
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: userId } },
          }),
        ),
      },
      from: vi.fn((table: string) => {
        if (table === 'journeys') {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              journeys.set(String(row.id), row)
              return Promise.resolve({ error: null })
            }),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: journeys.get(journeyId),
                    error: journeys.has(journeyId)
                      ? null
                      : new Error('missing'),
                  }),
                ),
              })),
            })),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    await localDb.localJourneys.add({
      createdAt: now,
      creatorId: userId,
      endsAt: null,
      id: journeyId,
      slug: `offline-trip-${journeyId}`,
      spaceId,
      startsAt: null,
      summary: 'Offline draft',
      syncStatus: 'pending',
      title: 'Offline trip',
      updatedAt: now,
    })
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: now,
        creatorId: userId,
        id: crypto.randomUUID(),
        journeyId,
        status: 'pending',
        type: 'journey.create',
      }),
    )

    await syncPendingOperations()

    await expect(localDb.syncOperations.toArray()).resolves.toEqual([])
    await expect(localDb.localJourneys.get(journeyId)).resolves.toMatchObject({
      syncStatus: 'synced',
    })
    expect(journeys.get(journeyId)).toMatchObject({
      id: journeyId,
      title: 'Offline trip',
    })
  })

  it('updates only entry photo position when the link already exists', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const now = new Date().toISOString()
    const updateEntryPhoto = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    }))
    const insertEntryPhoto = vi.fn(() =>
      Promise.resolve({ error: new Error('duplicate key value') }),
    )
    const selectEntryPhoto = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { photo_id: photoId }, error: null }),
          ),
        })),
      })),
    }))

    getSupabaseClientMock.mockReturnValue({
      auth: {
        getSession: vi.fn(() =>
          Promise.resolve({
            data: { session: { user: { id: userId } } },
          }),
        ),
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: { id: userId } },
          }),
        ),
      },
      from: vi.fn((table: string) => {
        if (table === 'photos') {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          }
        }
        if (table === 'photo_variants') {
          return {
            insert: vi.fn(() => Promise.resolve({ error: null })),
          }
        }
        if (table === 'entry_photos') {
          return {
            insert: insertEntryPhoto,
            select: selectEntryPhoto,
            update: updateEntryPhoto,
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
      rpc: vi.fn(() => Promise.resolve({ error: null })),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(() => Promise.resolve({ error: null })),
        })),
      },
    })

    await localDb.photos.add({
      capturedAt: now,
      createdAt: now,
      creatorId: userId,
      entryId,
      id: photoId,
      latitude: 49.1967,
      longitude: 16.607,
      position: 2,
      syncStatus: 'pending',
    })
    await localDb.photoVariants.add({
      blob: new Blob(['photo-bytes'], { type: 'image/jpeg' }),
      createdAt: now,
      ext: 'jpg',
      height: 1200,
      id: crypto.randomUUID(),
      kind: 'full',
      mimeType: 'image/jpeg',
      photoId,
      sizeBytes: 11,
      width: 1600,
    })
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: now,
        creatorId: userId,
        id: crypto.randomUUID(),
        photoId,
        status: 'pending',
        type: 'photo.upload',
      }),
    )

    await syncPendingOperations()

    expect(insertEntryPhoto).toHaveBeenCalledWith({
      creator_id: userId,
      entry_id: entryId,
      photo_id: photoId,
      position: 2,
    })
    expect(updateEntryPhoto).toHaveBeenCalledWith({ position: 2 })
    await expect(localDb.photos.get(photoId)).resolves.toMatchObject({
      syncStatus: 'synced',
    })
    await expect(localDb.syncOperations.count()).resolves.toBe(0)
  })
})
