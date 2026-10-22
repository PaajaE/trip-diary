import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countUnreviewedMedia,
  listUnreviewedMedia,
  markMediaReviewed,
} from '@/entities/media/api/media-review.repository'

const J = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const row = {
  altitude: null,
  caption: null,
  captured_at: '2026-01-01T10:00:00+00:00',
  captured_tz: 'Europe/Prague',
  content_hash: null,
  created_at: '2026-01-01T10:00:00+00:00',
  deleted_at: null,
  duration_ms: null,
  focal_x: null,
  focal_y: null,
  height: 10,
  hide_location: false,
  id: A,
  journey_id: J,
  kind: 'photo',
  latitude: null,
  longitude: null,
  media_variants: [],
  moment_id: null,
  owner_id: J,
  reviewed_at: null,
  segment_override_id: null,
  source_asset_id: null,
  starred: false,
  status: 'ready',
  updated_at: '2026-01-01T10:00:00+00:00',
  width: 10,
}

let result: { count?: number | null; data: unknown; error: unknown } = {
  data: null,
  error: null,
}
let rpcResult: { data: unknown; error: unknown } = { data: 0, error: null }
const rpc = vi.fn(() => Promise.resolve(rpcResult))
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of ['select', 'eq', 'is', 'order', 'range']) {
  chain[name] = vi.fn(() => Object.assign(Promise.resolve(result), chain))
}
const from = vi.fn(() => chain)
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from, rpc }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  result = { data: null, error: null }
  rpcResult = { data: 0, error: null }
})

describe('unreviewed media', () => {
  it('lists live, ready, unreviewed media of the journey in capture order', async () => {
    result = { data: [row], error: null }
    const items = await listUnreviewedMedia(J)
    expect(from).toHaveBeenCalledWith('media')
    expect(chain.eq).toHaveBeenCalledWith('journey_id', J)
    expect(chain.eq).toHaveBeenCalledWith('status', 'ready')
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(chain.is).toHaveBeenCalledWith('reviewed_at', null)
    expect(chain.order).toHaveBeenCalledWith('captured_at', {
      ascending: true,
      nullsFirst: false,
    })
    expect(items.map((item) => item.id)).toEqual([A])
  })

  it('maps list failures to a typed error', async () => {
    result = { data: null, error: { message: 'boom' } }
    await expect(listUnreviewedMedia(J)).rejects.toMatchObject({
      code: 'list_failed',
    })
  })

  it('counts with a head request and the same filter', async () => {
    result = { count: 7, data: null, error: null }
    expect(await countUnreviewedMedia(J)).toBe(7)
    expect(chain.select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    })
    expect(chain.is).toHaveBeenCalledWith('reviewed_at', null)
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    result = { count: null, data: null, error: null }
    expect(await countUnreviewedMedia(J)).toBe(0)
    result = { data: null, error: { message: 'boom' } }
    await expect(countUnreviewedMedia(J)).rejects.toMatchObject({
      code: 'list_failed',
    })
  })
})

describe('markMediaReviewed', () => {
  it('calls mark_media_reviewed with the flag and returns the changed count', async () => {
    rpcResult = { data: 2, error: null }
    expect(await markMediaReviewed([A, 'b'])).toBe(2)
    expect(rpc).toHaveBeenLastCalledWith('mark_media_reviewed', {
      p_media_ids: [A, 'b'],
      p_reviewed: true,
    })
    await markMediaReviewed([A], false)
    expect(rpc).toHaveBeenLastCalledWith('mark_media_reviewed', {
      p_media_ids: [A],
      p_reviewed: false,
    })
  })

  it('skips the call for an empty list', async () => {
    expect(await markMediaReviewed([])).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends at most 500 ids per call and sums the counts', async () => {
    rpcResult = { data: 500, error: null }
    const ids = Array.from({ length: 1001 }, (_, i) => `id-${String(i)}`)
    expect(await markMediaReviewed(ids)).toBe(1500)
    expect(rpc).toHaveBeenCalledTimes(3)
    const sizes = (
      rpc.mock.calls as unknown as [string, { p_media_ids: string[] }][]
    ).map(([, args]) => args.p_media_ids.length)
    expect(sizes).toEqual([500, 500, 1])
  })

  it('maps SQLSTATE codes and rejects unexpected results', async () => {
    rpcResult = { data: null, error: { code: '42501', message: 'no' } }
    await expect(markMediaReviewed([A])).rejects.toMatchObject({
      code: 'forbidden',
    })
    rpcResult = { data: 'x', error: null }
    await expect(markMediaReviewed([A])).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })
})
