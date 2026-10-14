import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publicJourneyFixture } from '@/entities/public-journey/lib/public-journey.fixture'

const rpc = vi.fn()
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ rpc }),
}))

const { getPublicJourneyTree } =
  await import('@/entities/public-journey/api/public-journey.repository')

describe('getPublicJourneyTree', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('calls the single RPC and parses the tree', async () => {
    rpc.mockResolvedValue({ data: publicJourneyFixture, error: null })
    const result = await getPublicJourneyTree('ecerovi', 'kanada-2026')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_public_journey', {
      p_journey_slug: 'kanada-2026',
      p_space_handle: 'ecerovi',
    })
    expect(result?.journey.title).toBe('Kanada 2026')
  })

  it('returns null when the journey is not public', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(getPublicJourneyTree('a', 'b')).resolves.toBeNull()
  })

  it('rejects malformed payloads and RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: { journey: {} }, error: null })
    await expect(getPublicJourneyTree('a', 'b')).rejects.toThrow()
    rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') })
    await expect(getPublicJourneyTree('a', 'b')).rejects.toThrow('boom')
  })
})
