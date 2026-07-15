import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockGetSupabaseClient = vi.fn(() => ({ from: mockFrom }))
const mockIsSupabaseConfigured = vi.fn()
const mockCacheJourney = vi.fn()
const mockGetCachedJourney = vi.fn()
const mockReadCachedJourneyList = vi.fn()
const mockReplaceCachedJourneyList = vi.fn()

vi.mock('@/platform/supabase', () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
}))

vi.mock('@/platform/storage/sqlite', () => ({
  cacheJourney: (...args: unknown[]) => mockCacheJourney(...args),
  getCachedJourney: (...args: unknown[]) => mockGetCachedJourney(...args),
}))

vi.mock('@/platform/storage/journey-list-cache', () => ({
  clearCachedJourneyListForUser: vi.fn(),
  readCachedJourneyList: (...args: unknown[]) =>
    mockReadCachedJourneyList(...args),
  replaceCachedJourneyList: (...args: unknown[]) =>
    mockReplaceCachedJourneyList(...args),
}))

import {
  fetchJourneyDetail,
  fetchJourneyListRemote,
  type JourneyRepositoryError,
  loadJourneyList,
  type JourneyListItem,
} from './journeys.repository'
import type { CachedJourney } from '@/platform/storage/sqlite'

const sampleListItem: JourneyListItem = {
  endsAt: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  startsAt: '2026-07-10',
  status: 'active',
  summary: 'Coastal route',
  title: 'Summer trip',
  updatedAt: '2026-07-10T08:00:00.000+00:00',
}

const sampleJourney = (): CachedJourney => ({
  endsAt: sampleListItem.endsAt,
  id: sampleListItem.id,
  startsAt: sampleListItem.startsAt,
  status: sampleListItem.status,
  summary: sampleListItem.summary ?? '',
  title: sampleListItem.title,
})

function mockJourneySelectResult(result: {
  data: unknown
  error: { message: string } | null
}) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(result),
      }),
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  })
}

describe('fetchJourneyListRemote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns journeys when Supabase responds successfully', async () => {
    mockIsSupabaseConfigured.mockReturnValue(true)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                ends_at: sampleListItem.endsAt,
                id: sampleListItem.id,
                starts_at: sampleListItem.startsAt,
                status: sampleListItem.status,
                summary: sampleListItem.summary,
                title: sampleListItem.title,
                updated_at: sampleListItem.updatedAt,
              },
            ],
            error: null,
          }),
        }),
      }),
    })

    await expect(fetchJourneyListRemote()).resolves.toEqual([sampleListItem])
  })

  it('throws NOT_CONFIGURED when Supabase env is missing', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    await expect(fetchJourneyListRemote()).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    } satisfies Partial<JourneyRepositoryError>)
  })

  it('throws FETCH_FAILED when Supabase returns an error', async () => {
    mockIsSupabaseConfigured.mockReturnValue(true)
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Network error' },
          }),
        }),
      }),
    })

    await expect(fetchJourneyListRemote()).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Network error',
    } satisfies Partial<JourneyRepositoryError>)
  })
})

describe('loadJourneyList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSupabaseConfigured.mockReturnValue(true)
    mockReadCachedJourneyList.mockResolvedValue({
      cachedAt: '2026-07-09T08:00:00.000Z',
      journeys: [sampleListItem],
    })
    mockReplaceCachedJourneyList.mockResolvedValue(undefined)
  })

  it('returns cached journeys when offline without attempting remote fetch', async () => {
    const result = await loadJourneyList({
      isOnline: false,
      userId: 'user-a',
    })

    expect(result).toMatchObject({
      isFromCache: true,
      isOffline: true,
      journeys: [sampleListItem],
      refreshFailed: false,
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('replaces the cache after a successful online refresh', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                ends_at: sampleListItem.endsAt,
                id: sampleListItem.id,
                starts_at: sampleListItem.startsAt,
                status: sampleListItem.status,
                summary: sampleListItem.summary,
                title: sampleListItem.title,
                updated_at: sampleListItem.updatedAt,
              },
            ],
            error: null,
          }),
        }),
      }),
    })

    const result = await loadJourneyList({
      isOnline: true,
      userId: 'user-a',
    })

    expect(result.journeys).toEqual([sampleListItem])
    expect(result.isFromCache).toBe(false)
    expect(mockReplaceCachedJourneyList).toHaveBeenCalledWith('user-a', [
      sampleListItem,
    ])
  })

  it('clears cached rows when the remote list is authoritatively empty', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const result = await loadJourneyList({
      isOnline: true,
      userId: 'user-a',
    })

    expect(result.journeys).toEqual([])
    expect(result.isAuthoritativeEmpty).toBe(true)
    expect(mockReplaceCachedJourneyList).toHaveBeenCalledWith('user-a', [])
  })

  it('preserves cached journeys when a remote refresh fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Network error' },
          }),
        }),
      }),
    })

    const result = await loadJourneyList({
      isOnline: true,
      userId: 'user-a',
    })

    expect(result).toMatchObject({
      isFromCache: true,
      refreshFailed: true,
      journeys: [sampleListItem],
    })
    expect(mockReplaceCachedJourneyList).not.toHaveBeenCalled()
  })

  it('throws when online refresh fails and no cache exists', async () => {
    mockReadCachedJourneyList.mockResolvedValue({
      cachedAt: null,
      journeys: [],
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Network error' },
          }),
        }),
      }),
    })

    await expect(
      loadJourneyList({
        isOnline: true,
        userId: 'user-a',
      }),
    ).rejects.toMatchObject({
      code: 'FETCH_FAILED',
    } satisfies Partial<JourneyRepositoryError>)
  })
})

describe('fetchJourneyDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheJourney.mockResolvedValue(undefined)
  })

  it('returns remote journey and caches it when Supabase succeeds', async () => {
    mockIsSupabaseConfigured.mockReturnValue(true)
    const remote = sampleJourney()
    mockJourneySelectResult({
      data: {
        ends_at: remote.endsAt,
        id: remote.id,
        starts_at: remote.startsAt,
        status: remote.status,
        summary: remote.summary,
        title: remote.title,
      },
      error: null,
    })

    await expect(fetchJourneyDetail('journey-1', null)).resolves.toEqual({
      isOffline: false,
      journey: remote,
    })
    expect(mockCacheJourney).toHaveBeenCalledWith(remote)
  })

  it('falls back to cached journey when remote fetch fails', async () => {
    mockIsSupabaseConfigured.mockReturnValue(true)
    const cached = sampleJourney()
    mockJourneySelectResult({
      data: null,
      error: { message: 'Offline' },
    })

    await expect(fetchJourneyDetail('journey-1', cached)).resolves.toEqual({
      isOffline: true,
      journey: cached,
    })
    expect(mockCacheJourney).not.toHaveBeenCalled()
  })

  it('returns cached journey when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)
    const cached = sampleJourney()

    await expect(fetchJourneyDetail('journey-1', cached)).resolves.toEqual({
      isOffline: true,
      journey: cached,
    })
  })

  it('throws NOT_FOUND when remote and cache are unavailable', async () => {
    mockIsSupabaseConfigured.mockReturnValue(true)
    mockJourneySelectResult({
      data: null,
      error: { message: 'Not found' },
    })

    await expect(fetchJourneyDetail('journey-1', null)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<JourneyRepositoryError>)
  })
})
