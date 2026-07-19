import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}))

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import {
  resetMobileDatabaseForTests,
  getMobileDatabase,
} from '@/platform/storage/database'
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

describe('journey list cache repository', () => {
  beforeEach(async () => {
    memoryDb.reset()
    resetMobileDatabaseForTests()
    await getMobileDatabase()
  })

  it('returns an empty snapshot for a user/space with no cached rows', async () => {
    await expect(readCachedJourneyList('user-a', 'space-a')).resolves.toEqual({
      cachedAt: null,
      journeys: [],
      spaceId: 'space-a',
    })
  })

  it('scopes cached journeys by user and space', async () => {
    await replaceCachedJourneyList('user-a', 'space-a', [sampleItem])
    await replaceCachedJourneyList('user-a', 'space-b', [
      {
        ...sampleItem,
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Other space trip',
        updatedAt: '2026-07-11T08:00:00.000+00:00',
      },
    ])
    await replaceCachedJourneyList('user-b', 'space-a', [
      {
        ...sampleItem,
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Other user trip',
        updatedAt: '2026-07-12T08:00:00.000+00:00',
      },
    ])

    await expect(
      readCachedJourneyList('user-a', 'space-a'),
    ).resolves.toMatchObject({
      journeys: [{ id: sampleItem.id, title: 'Summer trip' }],
      spaceId: 'space-a',
    })
    await expect(
      readCachedJourneyList('user-a', 'space-b'),
    ).resolves.toMatchObject({
      journeys: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Other space trip',
        },
      ],
      spaceId: 'space-b',
    })
    await expect(
      readCachedJourneyList('user-b', 'space-a'),
    ).resolves.toMatchObject({
      journeys: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          title: 'Other user trip',
        },
      ],
    })
  })

  it('replaces only the matching user/space cache on empty remote success', async () => {
    await replaceCachedJourneyList('user-a', 'space-a', [sampleItem])
    await replaceCachedJourneyList('user-a', 'space-b', [
      {
        ...sampleItem,
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Other space trip',
      },
    ])

    await replaceCachedJourneyList('user-a', 'space-a', [])

    await expect(readCachedJourneyList('user-a', 'space-a')).resolves.toEqual({
      cachedAt: null,
      journeys: [],
      spaceId: 'space-a',
    })
    await expect(
      readCachedJourneyList('user-a', 'space-b'),
    ).resolves.toMatchObject({
      journeys: [{ title: 'Other space trip' }],
    })
  })

  it('clearCachedJourneyListForUser removes every space for that user', async () => {
    await replaceCachedJourneyList('user-a', 'space-a', [sampleItem])
    await replaceCachedJourneyList('user-a', 'space-b', [
      {
        ...sampleItem,
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Other space trip',
      },
    ])
    await replaceCachedJourneyList('user-b', 'space-a', [
      {
        ...sampleItem,
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Other user trip',
      },
    ])

    await clearCachedJourneyListForUser('user-a')

    await expect(readCachedJourneyList('user-a', 'space-a')).resolves.toEqual({
      cachedAt: null,
      journeys: [],
      spaceId: 'space-a',
    })
    await expect(readCachedJourneyList('user-a', 'space-b')).resolves.toEqual({
      cachedAt: null,
      journeys: [],
      spaceId: 'space-b',
    })
    await expect(
      readCachedJourneyList('user-b', 'space-a'),
    ).resolves.toMatchObject({
      journeys: [{ title: 'Other user trip' }],
    })
  })
})
