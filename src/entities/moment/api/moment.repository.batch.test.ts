import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMoments,
  deleteAutoMoments,
} from '@/entities/moment/api/moment.repository'

const J = '11111111-1111-4111-8111-111111111111'
const M = '22222222-2222-4222-8222-222222222222'
const U = '33333333-3333-4333-8333-333333333333'

let result: { error: unknown } = { error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['insert', 'delete', 'in', 'eq']) {
  chain[name] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}
const from = vi.fn(() => chain)
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

const input = {
  createdBy: U,
  endsAt: '2026-09-01T10:00:00.000Z',
  id: M,
  journeyId: J,
  latitude: 51.1,
  longitude: -115.3,
  startsAt: '2026-09-01T09:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  result = { error: null }
})

describe('moment batch repository', () => {
  it('inserts auto unlocked moments with granted columns only', async () => {
    await createMoments([input])
    expect(from).toHaveBeenCalledWith('moments')
    expect(chain.insert).toHaveBeenCalledWith([
      {
        created_by: U,
        ends_at: input.endsAt,
        id: M,
        journey_id: J,
        latitude: 51.1,
        locked: false,
        longitude: -115.3,
        origin: 'auto',
        starts_at: input.startsAt,
      },
    ])
  })

  it('rejects invalid input before any request and maps insert errors', async () => {
    await expect(
      createMoments([{ ...input, longitude: null }]),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(chain.insert).not.toHaveBeenCalled()
    result = { error: { message: 'rls' } }
    await expect(createMoments([input])).rejects.toMatchObject({
      code: 'create_failed',
    })
    await createMoments([])
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('deletes only auto unlocked moments', async () => {
    await deleteAutoMoments([M])
    expect(chain.in).toHaveBeenCalledWith('id', [M])
    expect(chain.eq).toHaveBeenCalledWith('origin', 'auto')
    expect(chain.eq).toHaveBeenCalledWith('locked', false)
    result = { error: { message: 'x' } }
    await expect(deleteAutoMoments([M])).rejects.toMatchObject({
      code: 'delete_failed',
    })
  })
})
