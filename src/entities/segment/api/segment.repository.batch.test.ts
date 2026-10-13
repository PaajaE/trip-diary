import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSegments,
  deleteSuggestedSegments,
  listJourneySegmentsIncludingRejected,
} from '@/entities/segment/api/segment.repository'

const J = '11111111-1111-4111-8111-111111111111'
const S = '22222222-2222-4222-8222-222222222222'
const U = '33333333-3333-4333-8333-333333333333'

let result: { data?: unknown; error: unknown } = { data: [], error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['select', 'insert', 'delete', 'in', 'eq', 'neq', 'order']) {
  chain[name] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}
const from = vi.fn(() => chain)
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

const stage = {
  createdBy: U,
  endsAt: '2026-09-05T00:00:00.000Z',
  id: S,
  journeyId: J,
  kind: 'stage' as const,
  origin: 'suggested' as const,
  startsAt: '2026-09-01T00:00:00.000Z',
  title: 'Stage 1',
}

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: [], error: null }
})

describe('segment batch repository', () => {
  it('lists including rejected rows (no origin filter)', async () => {
    await listJourneySegmentsIncludingRejected(J)
    expect(chain.eq).toHaveBeenCalledWith('journey_id', J)
    expect(chain.neq).not.toHaveBeenCalled()
  })

  it('inserts suggested segments in one request', async () => {
    await createSegments([stage])
    expect(chain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        created_by: U,
        kind: 'stage',
        origin: 'suggested',
        title: 'Stage 1',
      }),
    ])
  })

  it('validates the stage/trip shape and maps insert errors', async () => {
    await expect(
      createSegments([{ ...stage, kind: 'trip' as const }]),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(chain.insert).not.toHaveBeenCalled()
    result = { error: { message: 'x' } }
    await expect(createSegments([stage])).rejects.toMatchObject({
      code: 'create_failed',
    })
  })

  it('deletes only still-suggested segments', async () => {
    await deleteSuggestedSegments([S])
    expect(chain.in).toHaveBeenCalledWith('id', [S])
    expect(chain.eq).toHaveBeenCalledWith('origin', 'suggested')
    await deleteSuggestedSegments([])
    expect(from).toHaveBeenCalledTimes(1)
  })
})
