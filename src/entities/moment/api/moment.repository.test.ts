import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteMoment,
  listJourneyMoments,
  mergeMoments,
  splitMoment,
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
const rpc = vi.fn((name: string, args: unknown) => {
  void name
  void args
  return Promise.resolve(result)
})
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from, rpc }),
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

  it('merges via RPC with target and source', async () => {
    result = { data: M, error: null }
    await expect(mergeMoments(M, J)).resolves.toBe(M)
    expect(rpc).toHaveBeenCalledWith('merge_moments', {
      p_source: J,
      p_target: M,
    })
  })

  it('splits via RPC and generates a new id unless given', async () => {
    result = { data: J, error: null }
    await expect(splitMoment(M, '2026-01-01T10:30:00+00:00', J)).resolves.toBe(
      J,
    )
    expect(rpc).toHaveBeenCalledWith('split_moment', {
      p_at: '2026-01-01T10:30:00+00:00',
      p_moment: M,
      p_new_id: J,
    })
    await splitMoment(M, '2026-01-01T10:30:00+00:00')
    const args = rpc.mock.calls[1]?.[1] as { p_new_id: string }
    expect(args.p_new_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it.each([
    ['P0002', 'not_found'],
    ['42501', 'forbidden'],
    ['22023', 'invalid_input'],
    ['23505', 'conflict'],
    ['XX000', 'update_failed'],
  ])('maps RPC error %s to %s', async (pgCode, code) => {
    result = { data: null, error: { code: pgCode, message: 'x' } }
    await expect(mergeMoments(M, J)).rejects.toMatchObject({ code })
    await expect(
      splitMoment(M, '2026-01-01T10:30:00+00:00', J),
    ).rejects.toMatchObject({ code })
  })
})
