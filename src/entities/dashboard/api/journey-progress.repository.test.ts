import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getJourneyProgress,
  parseJourneyProgressRows,
} from '@/entities/dashboard/api/journey-progress.repository'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ rpc }),
}))

const J = '11111111-1111-4111-8111-111111111111'
const M = '22222222-2222-4222-8222-222222222222'

const row = {
  cover_media_id: M,
  days_total: 4,
  days_with_note: 1,
  journey_id: J,
  media_total: 20,
  media_unreviewed: 6,
  starred: 2,
}

describe('journey progress repository', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('maps rows and accepts a null cover', () => {
    expect(
      parseJourneyProgressRows([row, { ...row, cover_media_id: null }]),
    ).toEqual([
      {
        coverMediaId: M,
        daysTotal: 4,
        daysWithNote: 1,
        journeyId: J,
        mediaTotal: 20,
        mediaUnreviewed: 6,
        starred: 2,
      },
      expect.objectContaining({ coverMediaId: null }),
    ])
  })

  it('rejects malformed rows', () => {
    expect(() =>
      parseJourneyProgressRows([{ ...row, media_unreviewed: -1 }]),
    ).toThrow()
    expect(() => parseJourneyProgressRows('nope')).toThrow()
  })

  it('calls the RPC with the ids and skips it for none', async () => {
    rpc.mockResolvedValue({ data: [row], error: null })
    expect(await getJourneyProgress([J])).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('journey_progress', {
      p_journey_ids: [J],
    })
    rpc.mockClear()
    expect(await getJourneyProgress([])).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws when the RPC is missing or fails', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function not found' },
    })
    await expect(getJourneyProgress([J])).rejects.toThrow('function not found')
  })
})
