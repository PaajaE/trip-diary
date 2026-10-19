import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setMomentPlaceIfEmpty } from '@/entities/moment/api/moment.repository'

let result: { data: unknown; error: unknown } = { data: [], error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['update', 'eq', 'is', 'select']) {
  chain[name] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}
const from = vi.fn(() => chain)
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: [], error: null }
})

describe('setMomentPlaceIfEmpty', () => {
  it('updates only a moment whose place is still empty', async () => {
    result = { data: [{ id: 'm' }], error: null }
    await expect(setMomentPlaceIfEmpty('m', 'p')).resolves.toBe(true)
    expect(chain.update).toHaveBeenCalledWith({ place_id: 'p' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'm')
    expect(chain.is).toHaveBeenCalledWith('place_id', null)
  })

  it('reports false when nothing was updated', async () => {
    await expect(setMomentPlaceIfEmpty('m', 'p')).resolves.toBe(false)
  })

  it('throws a typed error on failure', async () => {
    result = { data: null, error: { message: 'boom' } }
    await expect(setMomentPlaceIfEmpty('m', 'p')).rejects.toMatchObject({
      code: 'update_failed',
    })
  })
})
