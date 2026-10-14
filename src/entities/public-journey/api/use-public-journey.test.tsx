import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publicJourneyFixture } from '@/entities/public-journey/lib/public-journey.fixture'

const rpc = vi.fn()
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ rpc }),
}))

const { usePublicJourney } =
  await import('@/entities/public-journey/api/use-public-journey')
const { parsePublicJourney } = await import('@trip-diary/core/public-journey')

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('usePublicJourney with embedded data', () => {
  beforeEach(() => {
    rpc.mockReset()
  })
  afterEach(() => {
    cleanup()
  })

  it('renders embedded data at once and revalidates once after idle', async () => {
    const embedded = parsePublicJourney(publicJourneyFixture)
    rpc.mockResolvedValue({ data: publicJourneyFixture, error: null })
    const { result } = renderHook(
      () => usePublicJourney('ecerovi', 'kanada-2026', embedded),
      { wrapper: wrapper() },
    )
    expect(result.current.isPending).toBe(false)
    expect(result.current.data).toEqual(embedded)
    expect(rpc).not.toHaveBeenCalled()
    await waitFor(
      () => {
        expect(rpc).toHaveBeenCalledTimes(1)
      },
      { timeout: 3000 },
    )
  })

  it('turns into null when the journey is no longer public', async () => {
    const embedded = parsePublicJourney(publicJourneyFixture)
    rpc.mockResolvedValue({ data: null, error: null })
    const { result } = renderHook(
      () => usePublicJourney('ecerovi', 'kanada-2026', embedded),
      { wrapper: wrapper() },
    )
    // Reading data tracks it, as the page does, so the update re-renders.
    expect(result.current.data).not.toBeNull()
    await waitFor(
      () => {
        expect(result.current.data).toBeNull()
      },
      { timeout: 3000 },
    )
  })

  it('does not fetch early without embedded data beyond the normal load', async () => {
    rpc.mockResolvedValue({ data: publicJourneyFixture, error: null })
    const { result } = renderHook(
      () => usePublicJourney('ecerovi', 'kanada-2026'),
      { wrapper: wrapper() },
    )
    expect(result.current.isPending).toBe(true)
    await waitFor(() => {
      expect(result.current.data).not.toBeUndefined()
    })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
