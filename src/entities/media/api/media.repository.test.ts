import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteMediaObjectsRemote,
  signVariantPut,
} from '@/entities/media/api/media-upload.api'
import {
  addVariant,
  createMedia,
  deleteMedia,
  markMediaReady,
} from '@/entities/media/api/media.repository'

const invoke = vi.fn()
const insert = vi.fn()
const eq = vi.fn()
const update = vi.fn(() => ({ eq }))
const del = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ delete: del, insert, update }))

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from, functions: { invoke } }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('media repository', () => {
  it('inserts media as uploading with the owner id', async () => {
    insert.mockResolvedValue({ error: null })
    await createMedia({
      capturedAt: null,
      capturedTz: null,
      contentHash: 'h',
      height: 1,
      id: 'm',
      latitude: null,
      longitude: null,
      ownerId: 'u',
      width: 2,
    })
    expect(from).toHaveBeenCalledWith('media')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm', owner_id: 'u', status: 'uploading' }),
    )
  })

  it('maps unique violations to a duplicate error', async () => {
    insert.mockResolvedValue({ error: { code: '23505', message: 'dup' } })
    await expect(
      createMedia({
        capturedAt: null,
        capturedTz: null,
        contentHash: 'h',
        height: null,
        id: 'm',
        latitude: null,
        longitude: null,
        ownerId: 'u',
        width: null,
      }),
    ).rejects.toMatchObject({ code: 'duplicate' })
  })

  it('inserts a variant with the returned key', async () => {
    insert.mockResolvedValue({ error: null })
    await addVariant({
      byteSize: 5,
      height: 1,
      kind: 'thumb',
      mediaId: 'm',
      mimeType: 'image/webp',
      storageKey: 'u/m/thumb.webp',
      width: 2,
    })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ storage_key: 'u/m/thumb.webp' }),
    )
  })

  it('updates status to ready', async () => {
    eq.mockResolvedValue({ error: null })
    await markMediaReady('m')
    expect(update).toHaveBeenCalledWith({ status: 'ready' })
    expect(eq).toHaveBeenCalledWith('id', 'm')
  })

  it('deletes the media row by id and reports failures', async () => {
    eq.mockResolvedValueOnce({ error: null })
    await deleteMedia('m')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 'm')
    eq.mockResolvedValueOnce({ error: { code: '42501', message: 'rls' } })
    await expect(deleteMedia('m')).rejects.toMatchObject({
      code: 'finalize_failed',
    })
  })
})

describe('media-upload api', () => {
  it('validates the sign-put response', async () => {
    invoke.mockResolvedValue({
      data: { headers: { a: 'b' }, key: 'k', publicUrl: 'p', url: 'u' },
      error: null,
    })
    await expect(
      signVariantPut({
        byteSize: 1,
        contentType: 'image/webp',
        kind: 'thumb',
        mediaId: 'm',
      }),
    ).resolves.toMatchObject({ key: 'k' })
    expect(invoke).toHaveBeenCalledWith('media-upload', {
      body: expect.objectContaining({ action: 'sign-put' }),
    })
  })

  it('rejects a malformed response', async () => {
    invoke.mockResolvedValue({ data: { url: 1 }, error: null })
    await expect(
      signVariantPut({
        byteSize: 1,
        contentType: 'image/webp',
        kind: 'thumb',
        mediaId: 'm',
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('surfaces delete failures', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('502') })
    await expect(deleteMediaObjectsRemote('m')).rejects.toMatchObject({
      code: 'delete_failed',
    })
  })
})
