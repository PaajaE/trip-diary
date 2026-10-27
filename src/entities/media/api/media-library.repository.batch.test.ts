import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assignMediaBatchToMoment,
  detachMediaFromMoment,
  moveMediaIfUnchanged,
} from '@/entities/media/api/media-library.repository'

let result: { data?: unknown; error: unknown } = { error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['update', 'in', 'is', 'eq', 'select']) {
  chain[name] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}
const from = vi.fn(() => chain)
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  result = { error: null }
})

describe('assignMediaBatchToMoment', () => {
  it('updates moment_id for all ids at once', async () => {
    await assignMediaBatchToMoment(['a', 'b'], 'm')
    expect(chain.update).toHaveBeenCalledWith({ moment_id: 'm' })
    expect(chain.in).toHaveBeenCalledWith('id', ['a', 'b'])
  })

  it('maps errors and skips empty input', async () => {
    result = { error: { message: 'x' } }
    await expect(assignMediaBatchToMoment(['a'], 'm')).rejects.toMatchObject({
      code: 'update_failed',
    })
    await assignMediaBatchToMoment([], 'm')
    expect(from).toHaveBeenCalledTimes(1)
  })
})

describe('detachMediaFromMoment', () => {
  it('clears moment_id for all ids at once and skips empty input', async () => {
    await detachMediaFromMoment(['a', 'b'])
    expect(chain.update).toHaveBeenCalledWith({ moment_id: null })
    expect(chain.in).toHaveBeenCalledWith('id', ['a', 'b'])
    await detachMediaFromMoment([])
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('maps errors', async () => {
    result = { error: { message: 'x' } }
    await expect(detachMediaFromMoment(['a'])).rejects.toMatchObject({
      code: 'update_failed',
    })
  })
})

describe('moveMediaIfUnchanged', () => {
  it('moves only rows still in the expected stop and returns them', async () => {
    result = { data: [{ id: 'a' }], error: null }
    expect(await moveMediaIfUnchanged(['a', 'b'], 'm2', 'm1')).toEqual(['a'])
    expect(chain.update).toHaveBeenCalledWith({ moment_id: 'm2' })
    expect(chain.in).toHaveBeenCalledWith('id', ['a', 'b'])
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(chain.eq).toHaveBeenCalledWith('moment_id', 'm1')
    expect(chain.select).toHaveBeenCalledWith('id')
  })

  it('filters on "no stop" when expected from none, and detaches with null', async () => {
    result = { data: [], error: null }
    await moveMediaIfUnchanged(['a'], null, null)
    expect(chain.update).toHaveBeenCalledWith({ moment_id: null })
    expect(chain.is).toHaveBeenCalledWith('moment_id', null)
    expect(chain.eq).not.toHaveBeenCalled()
  })

  it('maps errors and skips empty input', async () => {
    result = { error: { message: 'x' } }
    await expect(moveMediaIfUnchanged(['a'], 'm', null)).rejects.toMatchObject({
      code: 'update_failed',
    })
    expect(await moveMediaIfUnchanged([], 'm', null)).toEqual([])
    expect(from).toHaveBeenCalledTimes(1)
  })
})
