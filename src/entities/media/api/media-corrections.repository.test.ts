import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearMediaLocation,
  setMediaLocation,
  shiftMediaTime,
} from '@/entities/media/api/media-corrections.repository'
import { MAX_SHIFT_SECONDS } from '@/entities/media/model/media-library'

const A = '22222222-2222-4222-8222-222222222222'
const B = '33333333-3333-4333-8333-333333333333'

let rpcResult: { data: unknown; error: unknown } = { data: 0, error: null }
const rpc = vi.fn(() => Promise.resolve(rpcResult))
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ rpc }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  rpcResult = { data: 0, error: null }
})

describe('shiftMediaTime', () => {
  it('passes ids and delta and returns the changed count', async () => {
    rpcResult = { data: 2, error: null }
    expect(await shiftMediaTime([A, B], -3600)).toBe(2)
    expect(rpc).toHaveBeenCalledWith('shift_media_time', {
      p_delta_seconds: -3600,
      p_media_ids: [A, B],
    })
  })

  it('rejects a delta over the limit or a fraction before calling', async () => {
    await expect(
      shiftMediaTime([A], MAX_SHIFT_SECONDS + 1),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(shiftMediaTime([A], 1.5)).rejects.toMatchObject({
      code: 'invalid_input',
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(await shiftMediaTime([A], MAX_SHIFT_SECONDS)).toBe(0)
  })

  it('maps SQLSTATE codes and malformed results to typed errors', async () => {
    for (const [code, expected] of [
      ['P0002', 'not_found'],
      ['42501', 'forbidden'],
      ['22023', 'invalid_input'],
      ['XX000', 'update_failed'],
    ] as const) {
      rpcResult = { data: null, error: { code, message: 'x' } }
      await expect(shiftMediaTime([A], 60)).rejects.toMatchObject({
        code: expected,
      })
    }
    rpcResult = { data: 'two', error: null }
    await expect(shiftMediaTime([A], 60)).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('splits more than 500 ids into several calls and sums the counts', async () => {
    rpcResult = { data: 500, error: null }
    const ids = Array.from({ length: 501 }, (_, i) => `id-${String(i)}`)
    expect(await shiftMediaTime(ids, 60)).toBe(1000)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})

describe('setMediaLocation / clearMediaLocation', () => {
  it('sets coordinates through set_media_location', async () => {
    rpcResult = { data: 1, error: null }
    expect(await setMediaLocation([A], 50.08, 14.42)).toBe(1)
    expect(rpc).toHaveBeenCalledWith('set_media_location', {
      p_latitude: 50.08,
      p_longitude: 14.42,
      p_media_ids: [A],
    })
  })

  it('rejects out-of-range coordinates before calling', async () => {
    await expect(setMediaLocation([A], 91, 0)).rejects.toMatchObject({
      code: 'invalid_input',
    })
    await expect(setMediaLocation([A], 0, Number.NaN)).rejects.toMatchObject({
      code: 'invalid_input',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('clears the location through clear_media_location', async () => {
    rpcResult = { data: 3, error: null }
    expect(await clearMediaLocation([A, B])).toBe(3)
    expect(rpc).toHaveBeenCalledWith('clear_media_location', {
      p_media_ids: [A, B],
    })
  })

  it('maps a permission error', async () => {
    rpcResult = { data: null, error: { code: '42501', message: 'no' } }
    await expect(clearMediaLocation([A])).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})
