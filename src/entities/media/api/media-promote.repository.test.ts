import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrPromoteMedia } from '@/entities/media/api/media.repository'
import type { NewPhotoMedia } from '@/entities/media/model/media'

const J = '11111111-1111-4111-8111-111111111111'
const OTHER = '99999999-9999-4999-8999-999999999999'
const FOUND_ID = '22222222-2222-4222-8222-222222222222'
const NEW_ID = '33333333-3333-4333-8333-333333333333'
const HASH = 'b'.repeat(64)

const insert = vi.fn()
let lookup: { data: unknown; error: unknown } = { data: null, error: null }
const maybeSingle = vi.fn(() => Promise.resolve(lookup))
const eqSource = vi.fn(() => ({ maybeSingle }))
const eqOwner = vi.fn(() => ({ eq: eqSource }))
const select = vi.fn(() => ({ eq: eqOwner }))
const from = vi.fn(() => ({ insert, select }))
const promoteFoundMedia = vi.fn()
const triageFoundMedia = vi.fn()

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))
vi.mock('@/entities/media/api/media-found.repository', () => ({
  promoteFoundMedia: (...args: unknown[]) => promoteFoundMedia(...args),
  triageFoundMedia: (...args: unknown[]) => triageFoundMedia(...args),
}))

const input: NewPhotoMedia = {
  capturedAt: null,
  capturedTz: null,
  contentHash: HASH,
  height: 1,
  id: NEW_ID,
  journeyId: J,
  latitude: null,
  longitude: null,
  ownerId: 'u',
  sourceAssetId: 'asset-1',
  width: 2,
}

function existing(patch: Record<string, unknown>): void {
  lookup = {
    data: {
      deleted_at: null,
      id: FOUND_ID,
      journey_id: J,
      reviewed_at: null,
      starred: false,
      status: 'found',
      ...patch,
    },
    error: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  lookup = { data: null, error: null }
  insert.mockResolvedValue({ error: null })
  promoteFoundMedia.mockResolvedValue([
    { duplicateOf: null, mediaId: FOUND_ID, outcome: 'promoted' },
  ])
  triageFoundMedia.mockResolvedValue(1)
})

describe('createOrPromoteMedia', () => {
  it('no existing row: plain insert, no RPC (unchanged behaviour)', async () => {
    await expect(createOrPromoteMedia(input)).resolves.toEqual({
      mediaId: NEW_ID,
      reusedFoundRow: false,
    })
    expect(insert).toHaveBeenCalledTimes(1)
    expect(promoteFoundMedia).not.toHaveBeenCalled()
  })

  it('without journey or source asset: no lookup at all', async () => {
    const { journeyId, ...noJourney } = input
    void journeyId
    await createOrPromoteMedia(noJourney)
    expect(from).toHaveBeenCalledTimes(1)
    expect(select).not.toHaveBeenCalled()
  })

  it('kept found row: promotes it with the content hash, no insert', async () => {
    existing({ reviewed_at: '2026-11-10T10:00:00+00:00' })
    await expect(createOrPromoteMedia(input)).resolves.toEqual({
      mediaId: FOUND_ID,
      reusedFoundRow: true,
    })
    expect(promoteFoundMedia).toHaveBeenCalledWith([
      { contentHash: HASH, id: FOUND_ID },
    ])
    expect(triageFoundMedia).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('video (no content hash): promotes without a hash', async () => {
    existing({ reviewed_at: '2026-11-10T10:00:00+00:00' })
    await createOrPromoteMedia({ ...input, contentHash: null } as never)
    expect(promoteFoundMedia).toHaveBeenCalledWith([{ id: FOUND_ID }])
  })

  it('undecided found row: kept first, then promoted', async () => {
    existing({})
    await createOrPromoteMedia(input)
    expect(triageFoundMedia).toHaveBeenCalledWith([FOUND_ID], 'keep')
    expect(promoteFoundMedia).toHaveBeenCalledTimes(1)
    expect(insert).not.toHaveBeenCalled()
  })

  it('dismissed row: not uploaded, skipped as dismissed', async () => {
    existing({ deleted_at: '2026-11-10T10:00:00+00:00', reviewed_at: null })
    await expect(createOrPromoteMedia(input)).rejects.toMatchObject({
      code: 'dismissed',
    })
    expect(promoteFoundMedia).not.toHaveBeenCalled()
    expect(triageFoundMedia).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('promote reports duplicate: duplicate error, no insert', async () => {
    existing({ reviewed_at: '2026-11-10T10:00:00+00:00' })
    promoteFoundMedia.mockResolvedValue([
      { duplicateOf: OTHER, mediaId: FOUND_ID, outcome: 'duplicate' },
    ])
    await expect(createOrPromoteMedia(input)).rejects.toMatchObject({
      code: 'duplicate',
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('promote reports not_kept (dismissed meanwhile): dismissed', async () => {
    existing({ reviewed_at: '2026-11-10T10:00:00+00:00' })
    promoteFoundMedia.mockResolvedValue([
      { duplicateOf: null, mediaId: FOUND_ID, outcome: 'not_kept' },
    ])
    await expect(createOrPromoteMedia(input)).rejects.toMatchObject({
      code: 'dismissed',
    })
  })

  it('offline retry is idempotent: a pending row is resumed via already_promoted', async () => {
    existing({ reviewed_at: '2026-11-10T10:00:00+00:00', status: 'pending' })
    promoteFoundMedia.mockResolvedValue([
      { duplicateOf: null, mediaId: FOUND_ID, outcome: 'already_promoted' },
    ])
    await expect(createOrPromoteMedia(input)).resolves.toEqual({
      mediaId: FOUND_ID,
      reusedFoundRow: true,
    })
    expect(triageFoundMedia).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('network failure of promote is a retryable create_failed', async () => {
    existing({ reviewed_at: '2026-11-10T10:00:00+00:00' })
    promoteFoundMedia.mockRejectedValue(new Error('Failed to fetch'))
    await expect(createOrPromoteMedia(input)).rejects.toMatchObject({
      code: 'create_failed',
    })
  })

  it('network failure of the lookup is a retryable create_failed', async () => {
    lookup = { data: null, error: { message: 'Failed to fetch' } }
    await expect(createOrPromoteMedia(input)).rejects.toMatchObject({
      code: 'create_failed',
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('uploaded row (ready/uploading/failed): plain insert -> unique violation = duplicate as before', async () => {
    existing({ status: 'ready' })
    insert.mockResolvedValue({ error: { code: '23505', message: 'dup' } })
    await expect(createOrPromoteMedia(input)).rejects.toMatchObject({
      code: 'duplicate',
    })
    expect(promoteFoundMedia).not.toHaveBeenCalled()
  })

  it('row in another journey: plain insert path (unchanged)', async () => {
    existing({ journey_id: OTHER, reviewed_at: '2026-11-10T10:00:00+00:00' })
    insert.mockResolvedValue({ error: { code: '23505', message: 'dup' } })
    await expect(createOrPromoteMedia(input)).rejects.toMatchObject({
      code: 'duplicate',
    })
    expect(promoteFoundMedia).not.toHaveBeenCalled()
  })
})
