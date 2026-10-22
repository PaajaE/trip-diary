import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assignMediaBatchToMoment,
  detachMediaFromMoment,
} from '@/entities/media/api/media-library.repository'

let result: { error: unknown } = { error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['update', 'in']) {
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
