import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}))

vi.mock('@/platform/sync/photo-upload', () => ({
  PHOTO_UPLOAD_OPERATION: 'photo.upload',
  PhotoUploadError: class PhotoUploadError extends Error {
    retryable = false
  },
  processPhotoUploadOperation: vi.fn(),
}))

import { runSqlMigrations, SqlMigrationError } from '@/foundation/sqlite'
import {
  getMobileDatabase,
  initializeMobileDatabase,
  resetMobileDatabaseForTests,
} from '@/platform/storage/database'
import { MOBILE_SQL_MIGRATIONS } from '@/platform/storage/migrations'
import { cacheJourney, getCachedJourney } from '@/platform/storage/sqlite'
import { enqueueSyncOperation, getSyncOperation } from '@/platform/sync/queue'
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'
import { createInMemorySQLiteDatabase } from '@/platform/storage/test-utils/in-memory-sqlite'

const memoryDb = createInMemorySQLiteDatabase()

vi.mocked(openDatabaseAsync).mockImplementation(
  async () => memoryDb as unknown as SQLiteDatabase,
)

const sampleJourney = {
  endsAt: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  startsAt: '2026-07-10',
  status: 'active' as const,
  summary: 'Coastal route',
  title: 'Summer trip',
}

const sampleJourneyPayload = JSON.stringify({
  ends_at: sampleJourney.endsAt,
  id: sampleJourney.id,
  starts_at: sampleJourney.startsAt,
  status: sampleJourney.status,
  summary: sampleJourney.summary,
  title: sampleJourney.title,
})

describe('mobile database bootstrap', () => {
  beforeEach(() => {
    memoryDb.reset()
    resetMobileDatabaseForTests()
    vi.mocked(openDatabaseAsync).mockImplementation(
      async () => memoryDb as unknown as SQLiteDatabase,
    )
  })

  it('applies all migrations on a fresh database', async () => {
    await initializeMobileDatabase()

    expect(memoryDb.getMigrationIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(memoryDb.getTableRowCount('journey_cache')).toBe(0)
    expect(memoryDb.getTableRowCount('sync_queue')).toBe(0)
    expect(memoryDb.getTableRowCount('journey_list_cache')).toBe(0)
    expect(memoryDb.getTableRowCount('journey_stop_cache')).toBe(0)
    expect(memoryDb.getTableRowCount('moment_draft_photos')).toBe(0)
    expect(memoryDb.getTableRowCount('local_moments')).toBe(0)
    expect(memoryDb.getTableRowCount('journey_content_cache')).toBe(0)
    expect(memoryDb.tableHasColumn('sync_queue', 'status_updated_at')).toBe(
      true,
    )
    expect(memoryDb.tableHasColumn('moment_draft_photos', 'small_uri')).toBe(
      true,
    )
  })

  it('is idempotent when initialization is called repeatedly', async () => {
    await initializeMobileDatabase()
    await initializeMobileDatabase()
    await getMobileDatabase()

    expect(memoryDb.getMigrationIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('shares one migration run across concurrent initialization calls', async () => {
    const [first, second, third] = await Promise.all([
      getMobileDatabase(),
      getMobileDatabase(),
      getMobileDatabase(),
    ])

    expect(first).toBe(second)
    expect(second).toBe(third)
    expect(memoryDb.getMigrationIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('upgrades a Stage 3 database without losing journey cache or queue data', async () => {
    memoryDb.seedJourneyCacheRow({
      cached_at: '2026-07-10T08:00:00.000Z',
      id: 'journey-legacy',
      payload: sampleJourneyPayload,
    })
    memoryDb.seedLegacySyncQueueRow({
      created_at: '2026-07-10T09:00:00.000Z',
      id: 'op-pending',
      operation_type: 'photo.upload',
      payload: JSON.stringify({ photoId: 'photo-1' }),
      status: 'pending',
    })
    memoryDb.seedSyncQueueRow({
      created_at: '2026-07-10T09:30:00.000Z',
      id: 'op-processing',
      operation_type: 'photo.upload',
      payload: JSON.stringify({ photoId: 'photo-2' }),
      status: 'processing',
      status_updated_at: '2026-07-10T09:31:00.000Z',
    })

    await getMobileDatabase()

    expect(memoryDb.getMigrationIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(memoryDb.getJourneyCacheRow('journey-legacy')?.payload).toBe(
      sampleJourneyPayload,
    )
    expect(memoryDb.getTableRowCount('journey_list_cache')).toBe(0)
    expect(memoryDb.getSyncQueueRow('op-pending')?.status).toBe('pending')
    expect(memoryDb.getSyncQueueRow('op-pending')?.status_updated_at).toBe(
      '2026-07-10T09:00:00.000Z',
    )
    expect(memoryDb.getSyncQueueRow('op-processing')?.status_updated_at).toBe(
      '2026-07-10T09:31:00.000Z',
    )
  })

  it('backfills empty status_updated_at values from created_at during upgrade', async () => {
    memoryDb.seedSyncQueueRow({
      created_at: '2026-07-10T10:00:00.000Z',
      id: 'op-empty-ts',
      operation_type: 'journey.touch',
      payload: '{}',
      status: 'synced',
      status_updated_at: '',
    })

    await getMobileDatabase()

    expect(memoryDb.getSyncQueueRow('op-empty-ts')?.status_updated_at).toBe(
      '2026-07-10T10:00:00.000Z',
    )
  })

  it('does not re-run completed migrations', async () => {
    await runSqlMigrations(memoryDb, MOBILE_SQL_MIGRATIONS)
    expect(await runSqlMigrations(memoryDb, MOBILE_SQL_MIGRATIONS)).toBe(0)
    expect(memoryDb.getMigrationIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('does not record a migration when it fails', async () => {
    await runSqlMigrations(memoryDb, MOBILE_SQL_MIGRATIONS)

    const failingMigration = {
      id: 99,
      name: 'boom',
      up: async () => {
        throw new Error('boom')
      },
    }

    await expect(
      runSqlMigrations(memoryDb, [failingMigration]),
    ).rejects.toBeInstanceOf(SqlMigrationError)

    expect(memoryDb.getMigrationIds()).not.toContain(99)
    expect(memoryDb.getMigrationIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('allows a later initialization retry after a failed open attempt', async () => {
    vi.mocked(openDatabaseAsync)
      .mockRejectedValueOnce(new Error('temporary open failure'))
      .mockImplementation(async () => memoryDb as unknown as SQLiteDatabase)

    resetMobileDatabaseForTests()
    await expect(getMobileDatabase()).rejects.toThrow(
      'Failed to initialize mobile database',
    )

    resetMobileDatabaseForTests()
    await expect(getMobileDatabase()).resolves.toBe(memoryDb)
    expect(memoryDb.getMigrationIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('mobile database consumers', () => {
  beforeEach(async () => {
    memoryDb.reset()
    resetMobileDatabaseForTests()
    await getMobileDatabase()
  })

  it('supports journey cache reads and writes through the bootstrap', async () => {
    await cacheJourney(sampleJourney)

    expect(
      await getCachedJourney('11111111-1111-4111-8111-111111111111'),
    ).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Summer trip',
    })
  })

  it('supports sync queue writes through the bootstrap', async () => {
    const operation = await enqueueSyncOperation({
      id: 'consumer-op',
      operationType: 'journey.touch',
      payload: { journeyId: 'journey-1' },
    })

    expect(operation.status).toBe('pending')
    expect(await getSyncOperation('consumer-op')).toMatchObject({
      id: 'consumer-op',
      status: 'pending',
    })
  })
})
