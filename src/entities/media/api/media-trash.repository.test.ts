import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimMediaPurge,
  createMomentFromMedia,
  listTrashedMedia,
  moveMedia,
  purgeMediaRows,
  restoreMedia,
  trashMedia,
} from '@/entities/media/api/media-trash.repository'

const A = '22222222-2222-4222-8222-222222222222'
const B = '33333333-3333-4333-8333-333333333333'
const J = '11111111-1111-4111-8111-111111111111'

let rpcResult: { data: unknown; error: unknown } = { data: 0, error: null }
const rpc = vi.fn(() => Promise.resolve(rpcResult))
let listResult: { data: unknown; error: unknown } = { data: [], error: null }
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['select', 'eq', 'not', 'order', 'range']) {
  chain[name] = vi.fn(() => Object.assign(Promise.resolve(listResult), chain))
}
const from = vi.fn(() => chain)
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from, rpc }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  rpcResult = { data: 0, error: null }
  listResult = { data: [], error: null }
})

describe('trash RPCs', () => {
  it('trash_media and restore_media pass the ids and return the count', async () => {
    rpcResult = { data: 2, error: null }
    expect(await trashMedia([A, B])).toBe(2)
    expect(rpc).toHaveBeenLastCalledWith('trash_media', { p_media_ids: [A, B] })
    expect(await restoreMedia([A, B])).toBe(2)
    expect(rpc).toHaveBeenLastCalledWith('restore_media', {
      p_media_ids: [A, B],
    })
  })

  it('skips the call for an empty list', async () => {
    expect(await trashMedia([])).toBe(0)
    expect(await purgeMediaRows([])).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('splits more than 500 ids into several calls and sums the counts', async () => {
    rpcResult = { data: 500, error: null }
    const ids = Array.from({ length: 501 }, (_, i) => `id-${String(i)}`)
    await trashMedia(ids)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('maps SQLSTATE codes to typed errors', async () => {
    for (const [code, expected] of [
      ['P0002', 'not_found'],
      ['42501', 'forbidden'],
      ['22023', 'invalid_input'],
      ['XX000', 'update_failed'],
    ] as const) {
      rpcResult = { data: null, error: { code, message: 'x' } }
      await expect(trashMedia([A])).rejects.toMatchObject({ code: expected })
    }
  })

  it('rejects an unexpected result shape', async () => {
    rpcResult = { data: 'two', error: null }
    await expect(restoreMedia([A])).rejects.toMatchObject({
      code: 'invalid_response',
    })
    rpcResult = { data: -1, error: null }
    await expect(restoreMedia([A])).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('purge_media returns the removed ids and validates them', async () => {
    rpcResult = { data: [A], error: null }
    expect(await purgeMediaRows([A, B])).toEqual([A])
    expect(rpc).toHaveBeenLastCalledWith('purge_media', { p_media_ids: [A, B] })
    rpcResult = { data: ['not-a-uuid'], error: null }
    await expect(purgeMediaRows([A])).rejects.toMatchObject({
      code: 'invalid_response',
    })
    rpcResult = { data: null, error: { code: '42501', message: 'x' } }
    await expect(purgeMediaRows([A])).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('claim_media_purge returns exactly the claimed ids', async () => {
    rpcResult = { data: [B], error: null }
    expect(await claimMediaPurge([A, B])).toEqual([B])
    expect(rpc).toHaveBeenLastCalledWith('claim_media_purge', {
      p_media_ids: [A, B],
    })
    rpcResult = { data: null, error: { code: '42501', message: 'x' } }
    await expect(claimMediaPurge([A])).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('move_media never sends an empty target', async () => {
    await expect(moveMedia([A], '')).rejects.toMatchObject({
      code: 'invalid_input',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('move_media sends the target moment', async () => {
    rpcResult = { data: 1, error: null }
    expect(await moveMedia([A], J)).toBe(1)
    expect(rpc).toHaveBeenLastCalledWith('move_media', {
      p_media_ids: [A],
      p_target_moment: J,
    })
  })

  it('create_moment_from_media returns the new id and guards input', async () => {
    rpcResult = { data: J, error: null }
    expect(await createMomentFromMedia([A], J)).toBe(J)
    expect(rpc).toHaveBeenLastCalledWith('create_moment_from_media', {
      p_media_ids: [A],
      p_new_id: J,
    })
    await expect(createMomentFromMedia([], J)).rejects.toMatchObject({
      code: 'invalid_input',
    })
    rpcResult = { data: 'nope', error: null }
    await expect(createMomentFromMedia([A], J)).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })
})

describe('listTrashedMedia', () => {
  it('reads only trashed rows of the journey, newest trash first', async () => {
    await listTrashedMedia(J)
    expect(from).toHaveBeenCalledWith('media')
    expect(chain.eq).toHaveBeenCalledWith('journey_id', J)
    expect(chain.not).toHaveBeenCalledWith('deleted_at', 'is', null)
    expect(chain.order).toHaveBeenCalledWith('deleted_at', { ascending: false })
  })
})
