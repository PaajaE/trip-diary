import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-test-renderer'
import type { JourneyHeader } from '@trip-diary/core/journey'
import {
  renderHook,
  waitForHook,
} from '@/foundation/test-utils/render-hook'
import { createQueryClient } from '@/foundation/query-client'

const mockGetCachedJourney = vi.fn()
const mockFetchJourneyDetail = vi.fn()

vi.mock('@/platform/storage/sqlite', () => ({
  getCachedJourney: (...args: unknown[]) => mockGetCachedJourney(...args),
}))

vi.mock('@/features/journeys/api/journeys.repository', () => ({
  fetchJourneyDetail: (...args: unknown[]) => mockFetchJourneyDetail(...args),
}))

import { useJourneyQuery } from '@/features/journeys/use-journey-query'

const journeyId = '11111111-1111-4111-8111-111111111111'

const cachedJourney: JourneyHeader = {
  endsAt: null,
  id: journeyId,
  startsAt: '2026-07-01',
  status: 'active',
  summary: 'Cached summary',
  title: 'Cached trip',
}

const remoteJourney: JourneyHeader = {
  endsAt: '2026-07-10',
  id: journeyId,
  startsAt: '2026-07-01',
  status: 'active',
  summary: 'Remote summary',
  title: 'Remote trip',
}

describe('useJourneyQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows cached journey as placeholder then revalidates from network', async () => {
    let resolveRemote: (value: {
      isOffline: boolean
      journey: JourneyHeader
    }) => void = () => undefined

    mockGetCachedJourney.mockResolvedValue(cachedJourney)
    mockFetchJourneyDetail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRemote = resolve
        }),
    )

    const queryClient = createQueryClient()
    const { result, unmount } = renderHook(() => useJourneyQuery(journeyId), {
      queryClient,
    })

    await waitForHook(() => {
      expect(result.current.data).toEqual({
        isOffline: true,
        journey: cachedJourney,
      })
      expect(result.current.isRevalidating).toBe(true)
    })

    expect(mockGetCachedJourney).toHaveBeenCalledWith(journeyId)
    expect(mockFetchJourneyDetail).toHaveBeenCalledWith(
      journeyId,
      cachedJourney,
    )

    await actResolve(() => {
      resolveRemote({ isOffline: false, journey: remoteJourney })
    })

    await waitForHook(() => {
      expect(result.current.data).toEqual({
        isOffline: false,
        journey: remoteJourney,
      })
      expect(result.current.isRevalidating).toBe(false)
      expect(result.current.isLoading).toBe(false)
    })

    unmount()
  })

  it('returns offline cache when remote fetch fails with cached fallback', async () => {
    mockGetCachedJourney.mockResolvedValue(cachedJourney)
    mockFetchJourneyDetail.mockResolvedValue({
      isOffline: true,
      journey: cachedJourney,
    })

    const { result, unmount } = renderHook(() => useJourneyQuery(journeyId), {
      queryClient: createQueryClient(),
    })

    await waitForHook(() => {
      expect(result.current.data).toEqual({
        isOffline: true,
        journey: cachedJourney,
      })
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
    })

    unmount()
  })

  it('does not fetch when journey id is missing', async () => {
    const { result, unmount } = renderHook(() => useJourneyQuery(undefined), {
      queryClient: createQueryClient(),
    })

    await waitForHook(() => {
      expect(result.current.fetchStatus).toBe('idle')
      expect(result.current.data).toBeUndefined()
    })

    expect(mockGetCachedJourney).not.toHaveBeenCalled()
    expect(mockFetchJourneyDetail).not.toHaveBeenCalled()
    unmount()
  })
})

async function actResolve(run: () => void): Promise<void> {
  await act(async () => {
    run()
    await Promise.resolve()
  })
}
