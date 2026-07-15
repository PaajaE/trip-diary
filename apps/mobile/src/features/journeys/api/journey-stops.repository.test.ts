import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockGetSupabaseClient = vi.fn(() => ({ from: mockFrom }))
const mockIsSupabaseConfigured = vi.fn()
const mockReadCachedJourneyStops = vi.fn()
const mockReplaceCachedJourneyStops = vi.fn()

vi.mock('@/platform/supabase', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
}))

vi.mock('@/platform/storage/journey-stop-cache', () => ({
  clearCachedJourneyStopsForJourney: vi.fn(),
  readCachedJourneyStops: (...args: unknown[]) =>
    mockReadCachedJourneyStops(...args),
  replaceCachedJourneyStops: (...args: unknown[]) =>
    mockReplaceCachedJourneyStops(...args),
}))

import {
  fetchJourneyStopsRemote,
  type JourneyStopsRepositoryError,
  loadJourneyStops,
} from './journey-stops.repository'

const brnoStopRow = {
  id: '22222222-2222-4222-8222-222222222222',
  map_latitude: 49.1951,
  map_longitude: 16.6068,
  notes: 'Brno',
  position: 0,
  stage_id: null,
  status: 'visited',
  title: 'Brno',
}

describe('fetchJourneyStopsRemote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSupabaseConfigured.mockReturnValue(true)
  })

  it('returns validated stops from Supabase', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [brnoStopRow],
            error: null,
          }),
        }),
      }),
    })

    await expect(fetchJourneyStopsRemote('journey-1')).resolves.toMatchObject([
      { id: brnoStopRow.id, title: 'Brno' },
    ])
  })

  it('throws FETCH_FAILED on remote errors', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Denied' },
          }),
        }),
      }),
    })

    await expect(fetchJourneyStopsRemote('journey-1')).rejects.toMatchObject({
      code: 'FETCH_FAILED',
    } satisfies Partial<JourneyStopsRepositoryError>)
  })
})

describe('loadJourneyStops', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSupabaseConfigured.mockReturnValue(true)
    mockReadCachedJourneyStops.mockResolvedValue({
      cachedAt: '2026-07-10T08:00:00.000Z',
      stops: [
        {
          id: brnoStopRow.id,
          mapLatitude: 49.1951,
          mapLongitude: 16.6068,
          notes: 'Brno',
          position: 0,
          stageId: null,
          status: 'visited',
          title: 'Brno',
        },
      ],
    })
    mockReplaceCachedJourneyStops.mockResolvedValue(undefined)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [brnoStopRow],
            error: null,
          }),
        }),
      }),
    })
  })

  it('returns cached stops when offline', async () => {
    const result = await loadJourneyStops({
      isOnline: false,
      journeyId: 'journey-1',
      userId: 'user-a',
    })

    expect(result.isOffline).toBe(true)
    expect(result.stops).toHaveLength(1)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('replaces cache after a successful online fetch', async () => {
    await loadJourneyStops({
      isOnline: true,
      journeyId: 'journey-1',
      userId: 'user-a',
    })

    expect(mockReplaceCachedJourneyStops).toHaveBeenCalledWith(
      'user-a',
      'journey-1',
      expect.arrayContaining([expect.objectContaining({ title: 'Brno' })]),
    )
  })

  it('preserves cached stops when refresh fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Network error' },
          }),
        }),
      }),
    })

    const result = await loadJourneyStops({
      isOnline: true,
      journeyId: 'journey-1',
      userId: 'user-a',
    })

    expect(result.refreshFailed).toBe(true)
    expect(result.stops).toHaveLength(1)
    expect(mockReplaceCachedJourneyStops).not.toHaveBeenCalled()
  })

  it('clears cache on authoritative empty remote result', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const result = await loadJourneyStops({
      isOnline: true,
      journeyId: 'journey-1',
      userId: 'user-a',
    })

    expect(result.isAuthoritativeEmpty).toBe(true)
    expect(mockReplaceCachedJourneyStops).toHaveBeenCalledWith(
      'user-a',
      'journey-1',
      [],
    )
  })
})
