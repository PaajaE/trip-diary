import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useJourneyProgressQuery } from '@/entities/dashboard/api/use-journey-progress-query'

const { getCoverMedia, getJourneyProgress } = vi.hoisted(() => ({
  getCoverMedia: vi.fn(),
  getJourneyProgress: vi.fn(),
}))

vi.mock('@/entities/dashboard/api/journey-progress.repository', () => ({
  getCoverMedia,
  getJourneyProgress,
}))

const J = '11111111-1111-4111-8111-111111111111'
const M = '22222222-2222-4222-8222-222222222222'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useJourneyProgressQuery', () => {
  beforeEach(() => {
    getCoverMedia.mockReset()
    getJourneyProgress.mockReset()
  })

  it('stays undefined when the RPC fails, so the dashboard falls back', async () => {
    getJourneyProgress.mockRejectedValue(new Error('function not found'))
    const { result } = renderHook(() => useJourneyProgressQuery('u', [J]), {
      wrapper,
    })
    await waitFor(() => {
      expect(getJourneyProgress).toHaveBeenCalled()
    })
    expect(result.current).toBeUndefined()
    expect(getCoverMedia).not.toHaveBeenCalled()
  })

  it('loads covers in one batched call and keeps progress when covers fail', async () => {
    getJourneyProgress.mockResolvedValue([
      {
        coverMediaId: M,
        daysTotal: 1,
        daysWithNote: 0,
        journeyId: J,
        mediaTotal: 1,
        mediaUnreviewed: 1,
        starred: 0,
      },
    ])
    getCoverMedia.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useJourneyProgressQuery('u', [J]), {
      wrapper,
    })
    await waitFor(() => {
      expect(result.current?.progress.get(J)?.mediaUnreviewed).toBe(1)
    })
    await waitFor(() => {
      expect(getCoverMedia).toHaveBeenCalledTimes(1)
    })
    expect(getCoverMedia).toHaveBeenCalledWith([M])
    expect(result.current?.covers.size).toBe(0)
  })
})
