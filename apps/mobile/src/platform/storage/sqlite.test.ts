import { beforeEach, describe, expect, it, vi } from 'vitest'

const journeyCache = new Map<string, { cached_at: string; payload: string }>()

const mockDatabase = {
  execAsync: vi.fn(async () => {}),
  getAllAsync: vi.fn(async () => []),
  runAsync: vi.fn(
    async (sql: string, id: string, payload?: string, cachedAt?: string) => {
      if (sql.includes('INSERT INTO journey_cache')) {
        journeyCache.set(id, { cached_at: cachedAt!, payload: payload! })
      }
      if (sql.includes('DELETE FROM journey_cache')) {
        journeyCache.delete(id)
      }
    },
  ),
  getFirstAsync: vi.fn(async (sql: string, id: string) => {
    if (sql.includes('SELECT payload FROM journey_cache')) {
      const row = journeyCache.get(id)
      return row ?? null
    }
    return null
  }),
}

vi.mock('@/platform/storage/database', () => ({
  getMobileDatabase: vi.fn(async () => mockDatabase),
  resetMobileDatabaseForTests: vi.fn(),
}))

import {
  cacheJourney,
  clearJourneyCache,
  getCachedJourney,
  type CachedJourney,
} from './sqlite'

const sampleJourney = (): CachedJourney => ({
  endsAt: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  startsAt: '2026-07-10',
  status: 'active',
  summary: 'Coastal route',
  title: 'Summer trip',
})

describe('journey sqlite cache', () => {
  beforeEach(() => {
    journeyCache.clear()
  })

  it('stores and retrieves a journey by id', async () => {
    const journey = sampleJourney()

    await cacheJourney(journey)

    expect(await getCachedJourney('11111111-1111-4111-8111-111111111111')).toEqual(
      journey,
    )
  })

  it('persists legacy snake_case payloads while returning shared domain objects', async () => {
    const journey = sampleJourney()
    await cacheJourney(journey)

    const stored = journeyCache.get(journey.id)?.payload
    expect(JSON.parse(stored ?? '{}')).toEqual({
      ends_at: '2026-07-20',
      id: journey.id,
      starts_at: '2026-07-10',
      status: 'active',
      summary: 'Coastal route',
      title: 'Summer trip',
    })
  })

  it('reads legacy pre-H7 detail cache payloads unchanged', async () => {
    journeyCache.set('11111111-1111-4111-8111-111111111111', {
      cached_at: '2026-07-10T08:00:00.000Z',
      payload: JSON.stringify({
        ends_at: '2026-07-20',
        id: '11111111-1111-4111-8111-111111111111',
        starts_at: '2026-07-10',
        status: 'planning',
        summary: 'Coastal route',
        title: 'Summer trip',
      }),
    })

    expect(await getCachedJourney('11111111-1111-4111-8111-111111111111')).toEqual({
      endsAt: '2026-07-20',
      id: '11111111-1111-4111-8111-111111111111',
      startsAt: '2026-07-10',
      status: 'planning',
      summary: 'Coastal route',
      title: 'Summer trip',
    })
  })

  it('updates an existing cache entry on conflict', async () => {
    const journey = sampleJourney()
    await cacheJourney(journey)

    const updated = {
      ...journey,
      summary: 'Updated summary',
      title: 'Renamed trip',
    }
    await cacheJourney(updated)

    expect(await getCachedJourney(journey.id)).toEqual(updated)
  })

  it('returns null when the journey is not cached', async () => {
    expect(await getCachedJourney('missing')).toBeNull()
  })

  it('clears a cached journey', async () => {
    await cacheJourney(sampleJourney())

    await clearJourneyCache('11111111-1111-4111-8111-111111111111')

    expect(await getCachedJourney('11111111-1111-4111-8111-111111111111')).toBeNull()
  })
})
