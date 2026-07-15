import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}))

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { resetMobileDatabaseForTests, getMobileDatabase } from '@/platform/storage/database'
import {
  clearCachedJourneyListForUser,
  readCachedJourneyList,
  replaceCachedJourneyList,
} from '@/platform/storage/journey-list-cache'
import { createInMemorySQLiteDatabase } from '@/platform/storage/test-utils/in-memory-sqlite'

const memoryDb = createInMemorySQLiteDatabase()

vi.mocked(openDatabaseAsync).mockImplementation(
  async () => memoryDb as unknown as SQLiteDatabase,
)

const sampleItem = {
  endsAt: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  startsAt: '2026-07-10',
  status: 'active' as const,
  summary: 'Coastal route',
  title: 'Summer trip',
  updatedAt: '2026-07-10T08:00:00.000+00:00',
}

const legacyListCachePayload = JSON.stringify({
  ends_at: '2026-07-20',
  id: sampleItem.id,
  starts_at: '2026-07-10',
  status: 'active',
  summary: 'Coastal route',
  title: 'Summer trip',
  updated_at: '2026-07-10T08:00:00.000+00:00',
})

describe('journey list cache repository', () => {
  beforeEach(async () => {
    memoryDb.reset()
    resetMobileDatabaseForTests()
    await getMobileDatabase()
  })

  it('returns an empty snapshot for a user with no cached rows', async () => {
    await expect(readCachedJourneyList('user-a')).resolves.toEqual({
      cachedAt: null,
      journeys: [],
    })
  })

  it('reads cached journeys scoped to the requested user', async () => {
    await replaceCachedJourneyList('user-a', [sampleItem])
    await replaceCachedJourneyList('user-b', [
      {
        ...sampleItem,
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Other user trip',
        updatedAt: '2026-07-11T08:00:00.000+00:00',
      },
    ])

    await expect(readCachedJourneyList('user-a')).resolves.toMatchObject({
      journeys: [{ id: sampleItem.id, title: 'Summer trip' }],
    })
    await expect(readCachedJourneyList('user-b')).resolves.toMatchObject({
      journeys: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Other user trip' }],
    })
  })

  it('reads legacy pre-H7 snake_case list cache payloads', async () => {
    memoryDb.seedJourneyListCacheRow({
      cached_at: '2026-07-10T08:00:00.000Z',
      journey_id: sampleItem.id,
      payload: legacyListCachePayload,
      sort_order: 0,
      user_id: 'user-a',
    })

    await expect(readCachedJourneyList('user-a')).resolves.toMatchObject({
      journeys: [{ id: sampleItem.id, title: 'Summer trip', startsAt: '2026-07-10' }],
    })
  })

  it('replaces the cached snapshot and removes journeys no longer present remotely', async () => {
    await replaceCachedJourneyList('user-a', [
      sampleItem,
      {
        ...sampleItem,
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Old trip',
        updatedAt: '2026-07-09T08:00:00.000+00:00',
      },
    ])

    await replaceCachedJourneyList('user-a', [sampleItem])

    const snapshot = await readCachedJourneyList('user-a')
    expect(snapshot.journeys).toHaveLength(1)
    expect(snapshot.journeys[0]?.id).toBe(sampleItem.id)
    expect(memoryDb.getJourneyListCacheRowsForUser('user-a')).toHaveLength(1)
  })

  it('clears cached rows when an authoritative empty list is stored', async () => {
    await replaceCachedJourneyList('user-a', [sampleItem])
    await replaceCachedJourneyList('user-a', [])

    await expect(readCachedJourneyList('user-a')).resolves.toEqual({
      cachedAt: null,
      journeys: [],
    })
  })

  it('skips malformed cached rows without failing the entire read', async () => {
    memoryDb.seedJourneyListCacheRow({
      cached_at: '2026-07-10T08:00:00.000Z',
      journey_id: sampleItem.id,
      payload: legacyListCachePayload,
      sort_order: 0,
      user_id: 'user-a',
    })
    memoryDb.seedJourneyListCacheRow({
      cached_at: '2026-07-10T08:00:00.000Z',
      journey_id: 'broken-json',
      payload: '{not-json',
      sort_order: 1,
      user_id: 'user-a',
    })
    memoryDb.seedJourneyListCacheRow({
      cached_at: '2026-07-10T08:00:00.000Z',
      journey_id: 'broken-shape',
      payload: JSON.stringify({ id: 'missing-title' }),
      sort_order: 2,
      user_id: 'user-a',
    })

    await expect(readCachedJourneyList('user-a')).resolves.toMatchObject({
      journeys: [{ id: sampleItem.id }],
    })
  })

  it('clears only the requested user cache', async () => {
    await replaceCachedJourneyList('user-a', [sampleItem])
    await replaceCachedJourneyList('user-b', [
      {
        ...sampleItem,
        id: '22222222-2222-4222-8222-222222222222',
        updatedAt: '2026-07-11T08:00:00.000+00:00',
      },
    ])

    await clearCachedJourneyListForUser('user-a')

    await expect(readCachedJourneyList('user-a')).resolves.toMatchObject({
      journeys: [],
    })
    await expect(readCachedJourneyList('user-b')).resolves.toMatchObject({
      journeys: [{ id: '22222222-2222-4222-8222-222222222222' }],
    })
  })
})
