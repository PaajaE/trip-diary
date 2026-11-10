import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFoundMedia,
  knownSourceAssets,
  promoteFoundMedia,
  triageFoundMedia,
} from '@/entities/media/api/media-found.repository'

const J = '11111111-1111-4111-8111-111111111111'
const A = '22222222-2222-4222-8222-222222222222'
const B = '33333333-3333-4333-8333-333333333333'
const HASH = 'a'.repeat(64)

let rpcResult: { data: unknown; error: unknown } = { data: [], error: null }
const rpc = vi.fn(() => Promise.resolve(rpcResult))
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ rpc }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  rpcResult = { data: [], error: null }
})

const ids = (n: number): string[] =>
  Array.from(
    { length: n },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  )

describe('createFoundMedia', () => {
  it('sends validated camelCase items and maps the result rows', async () => {
    rpcResult = {
      data: [
        {
          asset_id: 'asset-1',
          current_status: 'found',
          dropped: false,
          in_journey_id: J,
          kept: true,
          media_id: A,
          outcome: 'existing',
        },
      ],
      error: null,
    }
    const result = await createFoundMedia(J, [
      { id: A, latitude: 50.1, sourceAssetId: 'asset-1' },
    ])
    expect(rpc).toHaveBeenCalledWith('create_found_media', {
      p_items: [{ id: A, latitude: 50.1, sourceAssetId: 'asset-1' }],
      p_journey_id: J,
    })
    expect(result).toEqual([
      {
        assetId: 'asset-1',
        dropped: false,
        inJourneyId: J,
        kept: true,
        mediaId: A,
        outcome: 'existing',
        status: 'found',
      },
    ])
  })

  it('splits into chunks of 1000', async () => {
    await createFoundMedia(
      J,
      ids(2001).map((id) => ({ id, sourceAssetId: id })),
    )
    expect(rpc).toHaveBeenCalledTimes(3)
    const sizes = rpc.mock.calls.map(
      (call) =>
        (call as unknown as [string, { p_items: unknown[] }])[1].p_items.length,
    )
    expect(sizes).toEqual([1000, 1000, 1])
  })

  it('rejects an invalid item before any call (empty / too long asset id, bad latitude)', async () => {
    await expect(
      createFoundMedia(J, [{ id: A, sourceAssetId: '' }]),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      createFoundMedia(J, [{ id: A, sourceAssetId: 'x'.repeat(256) }]),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      createFoundMedia(J, [{ id: A, latitude: 95, sourceAssetId: 's' }]),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not call for an empty list', async () => {
    expect(await createFoundMedia(J, [])).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps SQLSTATE codes to typed errors', async () => {
    for (const [code, expected] of [
      ['P0002', 'not_found'],
      ['42501', 'forbidden'],
      ['22023', 'invalid_input'],
      ['23514', 'invalid_input'],
      ['XX000', 'rpc_failed'],
    ] as const) {
      rpcResult = { data: null, error: { code, message: 'm' } }
      await expect(
        createFoundMedia(J, [{ id: A, sourceAssetId: 's' }]),
      ).rejects.toMatchObject({ code: expected, name: 'MediaFoundError' })
    }
  })

  it('rejects a malformed result', async () => {
    rpcResult = { data: [{ asset_id: 1 }], error: null }
    await expect(
      createFoundMedia(J, [{ id: A, sourceAssetId: 's' }]),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('triageFoundMedia', () => {
  it('passes the decision and sums counts over chunks', async () => {
    rpcResult = { data: 1000, error: null }
    expect(await triageFoundMedia(ids(1001), 'keep')).toBe(2000)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenNthCalledWith(1, 'triage_found_media', {
      p_decision: 'keep',
      p_media_ids: ids(1000),
    })
  })

  it('accepts every decision of the migration and nothing else', async () => {
    rpcResult = { data: 0, error: null }
    for (const decision of [
      'keep',
      'star',
      'unstar',
      'dismiss',
      'drop',
      'restore',
      'undecided',
    ] as const) {
      expect(await triageFoundMedia([A], decision)).toBe(0)
    }
    await expect(
      triageFoundMedia([A], 'nope' as unknown as 'keep'),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('maps errors and malformed counts; empty list makes no call', async () => {
    expect(await triageFoundMedia([], 'keep')).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
    rpcResult = { data: null, error: { code: '42501', message: 'no' } }
    await expect(triageFoundMedia([A], 'keep')).rejects.toMatchObject({
      code: 'forbidden',
    })
    rpcResult = { data: 'x', error: null }
    await expect(triageFoundMedia([A], 'keep')).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })
})

describe('promoteFoundMedia', () => {
  it('sends id and optional hash, maps outcomes', async () => {
    rpcResult = {
      data: [
        { duplicate_of: null, media_id: A, outcome: 'promoted' },
        { duplicate_of: A, media_id: B, outcome: 'duplicate' },
      ],
      error: null,
    }
    const result = await promoteFoundMedia([
      { contentHash: HASH, id: A },
      { id: B },
    ])
    expect(rpc).toHaveBeenCalledWith('promote_found_media', {
      p_items: [{ contentHash: HASH, id: A }, { id: B }],
    })
    expect(result).toEqual([
      { duplicateOf: null, mediaId: A, outcome: 'promoted' },
      { duplicateOf: A, mediaId: B, outcome: 'duplicate' },
    ])
  })

  it('rejects a malformed hash and an unknown outcome', async () => {
    await expect(
      promoteFoundMedia([{ contentHash: 'XYZ', id: A }]),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    rpcResult = {
      data: [{ duplicate_of: null, media_id: A, outcome: 'weird' }],
      error: null,
    }
    await expect(promoteFoundMedia([{ id: A }])).rejects.toMatchObject({
      code: 'invalid_response',
    })
  })

  it('chunks by 1000', async () => {
    await promoteFoundMedia(ids(1500).map((id) => ({ id })))
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})

describe('knownSourceAssets', () => {
  it('chunks ids by 1000 and maps rows', async () => {
    rpcResult = {
      data: [
        {
          in_journey_id: J,
          media_id: A,
          source_asset_id: 'a1',
          state: 'dismissed',
        },
      ],
      error: null,
    }
    const wanted = Array.from({ length: 1001 }, (_, i) => `a${String(i)}`)
    const result = await knownSourceAssets(J, wanted)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenNthCalledWith(1, 'known_source_assets', {
      p_journey_id: J,
      p_source_asset_ids: wanted.slice(0, 1000),
    })
    expect(result[0]).toEqual({
      inJourneyId: J,
      mediaId: A,
      sourceAssetId: 'a1',
      state: 'dismissed',
    })
  })

  it('rejects an unknown state and maps P0002', async () => {
    rpcResult = {
      data: [
        { in_journey_id: null, media_id: A, source_asset_id: 'a', state: 'x' },
      ],
      error: null,
    }
    await expect(knownSourceAssets(J, ['a'])).rejects.toMatchObject({
      code: 'invalid_response',
    })
    rpcResult = { data: null, error: { code: 'P0002', message: 'nf' } }
    await expect(knownSourceAssets(J, ['a'])).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
