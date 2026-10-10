import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteMoment,
  listJourneyMoments,
  updateMoment,
} from '@/entities/moment/api/moment.repository'

const J = '11111111-1111-4111-8111-111111111111'
const M = '22222222-2222-4222-8222-222222222222'
const row = {
  body: '',
  cover_media_id: null,
  created_at: '2026-01-01T10:00:00+00:00',
  created_by: J,
  ends_at: '2026-01-01T11:00:00+00:00',
  id: M,
  journey_id: J,
  latitude: 46.5,
  locked: false,
  longitude: 8.1,
  origin: 'auto',
  place_id: null,
  published: true,
  starts_at: '2026-01-01T10:00:00+00:00',
  title: null,
  updated_at: '2026-01-01T10:00:00+00:00',
}

let result: { data: unknown; error: unknown } = { data: null, error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of [
  'select',
  'update',
  'delete',
  'eq',
  'order',
  'maybeSingle',
]) {
  chain[name] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}
const from = vi.fn((table: string) => {
  void table
  return chain
})
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: null, error: null }
})

describe('moment repository', () => {
  it('lists moments of a journey', async () => {
    result = { data: [row], error: null }
    const moments = await listJourneyMoments(J)
    expect(from).toHaveBeenCalledWith('moments')
    expect(chain.eq).toHaveBeenCalledWith('journey_id', J)
    expect(moments[0]?.title).toBeNull()
  })

  it('rejects rows with out-of-range coordinates', async () => {
    result = { data: [{ ...row, latitude: 200 }], error: null }
    await expect(listJourneyMoments(J)).rejects.toMatchObject({
      code: 'invalid_row',
    })
  })

  it('maps patch to granted snake_case columns', async () => {
    result = { data: { ...row, locked: true }, error: null }
    await updateMoment(M, { locked: true, placeId: null, published: false })
    expect(chain.update).toHaveBeenCalledWith({
      locked: true,
      place_id: null,
      published: false,
    })
  })

  it('reports not_found and empty patches', async () => {
    await expect(updateMoment(M, { title: 'x' })).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(updateMoment(M, {})).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })

  it('maps delete errors', async () => {
    result = { data: null, error: { message: 'no' } }
    await expect(deleteMoment(M)).rejects.toMatchObject({
      code: 'delete_failed',
    })
  })
})
