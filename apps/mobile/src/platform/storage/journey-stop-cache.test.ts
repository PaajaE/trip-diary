import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}))

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { getMobileDatabase, resetMobileDatabaseForTests } from '@/platform/storage/database'
import {
  readCachedJourneyStops,
  replaceCachedJourneyStops,
} from '@/platform/storage/journey-stop-cache'
import { createInMemorySQLiteDatabase } from '@/platform/storage/test-utils/in-memory-sqlite'

const memoryDb = createInMemorySQLiteDatabase()

vi.mocked(openDatabaseAsync).mockImplementation(
  async () => memoryDb as unknown as SQLiteDatabase,
)

const sampleStop = {
  id: '22222222-2222-4222-8222-222222222222',
  mapLatitude: 49.1951,
  mapLongitude: 16.6068,
  notes: 'Brno',
  position: 0,
  stageId: null,
  status: 'visited' as const,
  title: 'Brno',
}

describe('journey stop cache repository', () => {
  beforeEach(async () => {
    memoryDb.reset()
    resetMobileDatabaseForTests()
    await getMobileDatabase()
  })

  it('isolates cached stops by user and journey', async () => {
    await replaceCachedJourneyStops('user-a', 'journey-1', [sampleStop])
    await replaceCachedJourneyStops('user-b', 'journey-1', [
      { ...sampleStop, id: '33333333-3333-4333-8333-333333333333', title: 'Other' },
    ])

    await expect(readCachedJourneyStops('user-a', 'journey-1')).resolves.toMatchObject({
      stops: [{ title: 'Brno' }],
    })
    await expect(readCachedJourneyStops('user-b', 'journey-1')).resolves.toMatchObject({
      stops: [{ title: 'Other' }],
    })
  })

  it('replaces cached stops and clears stale snapshots on empty success', async () => {
    await replaceCachedJourneyStops('user-a', 'journey-1', [sampleStop])
    await replaceCachedJourneyStops('user-a', 'journey-1', [])

    await expect(readCachedJourneyStops('user-a', 'journey-1')).resolves.toEqual({
      cachedAt: expect.any(String),
      stops: [],
    })
  })

  it('skips malformed cached stop payloads safely', async () => {
    memoryDb.seedJourneyStopCacheRow({
      cached_at: '2026-07-10T08:00:00.000Z',
      journey_id: 'journey-1',
      payload: JSON.stringify([
        sampleStop,
        { id: 'bad-stop', status: 'planned' },
      ]),
      user_id: 'user-a',
    })

    await expect(readCachedJourneyStops('user-a', 'journey-1')).resolves.toMatchObject({
      stops: [{ title: 'Brno' }],
    })
  })
})
