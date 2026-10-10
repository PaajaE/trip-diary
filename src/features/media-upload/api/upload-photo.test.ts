import { describe, expect, it, vi } from 'vitest'
import type { PhotoVariantKind } from '@/entities/photo/model/photo'
import {
  MediaUploadError,
  type NewMediaVariant,
  type NewPhotoMedia,
} from '@/entities/media/model/media'
import {
  toV2VariantKind,
  uploadPhoto,
  type UploadPhotoDeps,
} from '@/features/media-upload/api/upload-photo'

vi.mock('@/shared/api/supabase', () => ({ getSupabaseClient: vi.fn() }))
vi.mock('@/entities/photo/lib/process-photo', () => ({
  processPhoto: vi.fn(),
}))

const OWNER = '11111111-1111-4111-8111-111111111111'
const MEDIA = '22222222-2222-4222-8222-222222222222'

function variant(kind: PhotoVariantKind, size: number) {
  return {
    blob: new Blob([new Uint8Array(size)]),
    ext: 'webp' as const,
    height: size,
    kind,
    mimeType: 'image/webp' as const,
    width: size * 2,
  }
}

function makeDeps(calls: string[], overrides: Partial<UploadPhotoDeps> = {}) {
  const deps: UploadPhotoDeps = {
    addVariant: vi.fn((v: NewMediaVariant) => {
      calls.push(`variant:${v.kind}:${v.storageKey}`)
      return Promise.resolve()
    }),
    createMedia: vi.fn((m: NewPhotoMedia) => {
      calls.push(`create:${m.id}`)
      return Promise.resolve()
    }),
    deleteMedia: vi.fn(() => {
      calls.push('delete-row')
      return Promise.resolve()
    }),
    deleteMediaObjects: vi.fn(() => {
      calls.push('delete-r2')
      return Promise.resolve(2)
    }),
    hashFile: vi.fn(() => Promise.resolve('a'.repeat(64))),
    markMediaFailed: vi.fn(() => {
      calls.push('failed')
      return Promise.resolve()
    }),
    markMediaReady: vi.fn(() => {
      calls.push('ready')
      return Promise.resolve()
    }),
    newId: () => MEDIA,
    processPhoto: vi.fn(() =>
      Promise.resolve({
        capturedAt: null,
        latitude: 50.08,
        longitude: 14.42,
        variants: [variant('thumb', 1), variant('full', 3)],
      }),
    ),
    put: vi.fn((signed: { url: string }) => {
      calls.push(`put:${signed.url}`)
      return Promise.resolve()
    }),
    readExifTime: vi.fn(() =>
      Promise.resolve({
        dateTimeOriginal: '2026:09:11 12:00:00',
        offsetTimeOriginal: '+02:00',
        subsecTimeOriginal: null,
      }),
    ),
    signPut: vi.fn((input: Parameters<UploadPhotoDeps['signPut']>[0]) => {
      calls.push(`sign:${input.kind}`)
      return Promise.resolve({
        headers: { 'content-type': input.contentType },
        key: `${OWNER}/${MEDIA}/${input.kind}.webp`,
        publicUrl: `https://cdn/${input.kind}`,
        url: `https://r2/${input.kind}`,
      })
    }),
    ...overrides,
  }
  return deps
}

const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })

describe('uploadPhoto', () => {
  it('runs create -> sign/put/variant per kind -> ready, mapping full to large', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls)
    const result = await uploadPhoto(file, { deps, ownerId: OWNER })

    expect(calls).toEqual([
      `create:${MEDIA}`,
      'sign:thumb',
      'put:https://r2/thumb',
      `variant:thumb:${OWNER}/${MEDIA}/thumb.webp`,
      'sign:large',
      'put:https://r2/large',
      `variant:large:${OWNER}/${MEDIA}/large.webp`,
      'ready',
    ])
    expect(result.variants.map((v) => v.kind)).toEqual(['thumb', 'large'])
    expect(deps.createMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        capturedAt: '2026-09-11T10:00:00.000Z',
        capturedTz: 'Europe/Prague',
        contentHash: 'a'.repeat(64),
        height: 3,
        ownerId: OWNER,
        width: 6,
      }),
    )
  })

  it('passes journeyId to createMedia only when given', async () => {
    const withJourney = makeDeps([])
    await uploadPhoto(file, {
      deps: withJourney,
      journeyId: 'J1',
      ownerId: OWNER,
    })
    expect(withJourney.createMedia).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: 'J1' }),
    )
    const without = makeDeps([])
    await uploadPhoto(file, { deps: without, ownerId: OWNER })
    expect(
      vi.mocked(without.createMedia).mock.calls[0]?.[0],
    ).not.toHaveProperty('journeyId')
  })

  it('falls back to source metadata only when the file has no capture time', async () => {
    const noExif = makeDeps([], {
      processPhoto: vi.fn(() =>
        Promise.resolve({
          capturedAt: null,
          latitude: null,
          longitude: null,
          variants: [variant('full', 3)],
        }),
      ),
      readExifTime: vi.fn(() =>
        Promise.resolve({
          dateTimeOriginal: null,
          offsetTimeOriginal: null,
          subsecTimeOriginal: null,
        }),
      ),
    })
    await uploadPhoto(file, {
      deps: noExif,
      fallbackCapture: {
        creationDate: '2026-09-11T10:00:00.000Z',
        latitude: 50.08,
        longitude: 14.42,
      },
      ownerId: OWNER,
    })
    expect(noExif.createMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        capturedAt: '2026-09-11T10:00:00.000Z',
        capturedTz: 'Europe/Prague',
        latitude: 50.08,
      }),
    )
    // The file's own EXIF wins over the fallback.
    const withExif = makeDeps([])
    await uploadPhoto(file, {
      deps: withExif,
      fallbackCapture: { creationDate: '2020-01-01T00:00:00.000Z' },
      ownerId: OWNER,
    })
    expect(withExif.createMedia).toHaveBeenCalledWith(
      expect.objectContaining({ capturedAt: '2026-09-11T10:00:00.000Z' }),
    )
  })

  it('reports progress', async () => {
    const onProgress = vi.fn()
    await uploadPhoto(file, {
      deps: makeDeps([]),
      onProgress,
      ownerId: OWNER,
    })
    expect(onProgress).toHaveBeenLastCalledWith({
      completedVariants: 2,
      phase: 'done',
      totalVariants: 2,
    })
  })

  it('marks failed and deletes R2 objects when a PUT fails', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      put: vi.fn(() =>
        Promise.reject(new MediaUploadError('upload_failed', 'boom')),
      ),
    })
    await expect(
      uploadPhoto(file, { deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'upload_failed' })
    expect(calls).toEqual([
      `create:${MEDIA}`,
      'sign:thumb',
      'failed',
      'delete-r2',
      'delete-row',
    ])
    expect(deps.markMediaReady).not.toHaveBeenCalled()
  })

  it('keeps the failed row and the original error when R2 cleanup fails', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      deleteMediaObjects: vi.fn(() => {
        calls.push('delete-r2')
        return Promise.reject(new MediaUploadError('delete_failed', 'r2'))
      }),
      put: vi.fn(() =>
        Promise.reject(new MediaUploadError('upload_failed', 'boom')),
      ),
    })
    await expect(
      uploadPhoto(file, { deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'upload_failed', message: 'boom' })
    expect(calls).toEqual([
      `create:${MEDIA}`,
      'sign:thumb',
      'failed',
      'delete-r2',
    ])
    expect(deps.deleteMedia).not.toHaveBeenCalled()
  })

  it('keeps the original error when deleting the row fails after R2 cleanup', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      deleteMedia: vi.fn(() => Promise.reject(new Error('rls'))),
      put: vi.fn(() =>
        Promise.reject(new MediaUploadError('upload_failed', 'boom')),
      ),
    })
    await expect(
      uploadPhoto(file, { deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'upload_failed', message: 'boom' })
    expect(calls).toContain('delete-r2')
  })

  it('still cleans R2 when marking failed throws', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      markMediaFailed: vi.fn(() => Promise.reject(new Error('rls'))),
      markMediaReady: vi.fn(() => Promise.reject(new Error('rls'))),
    })
    await expect(
      uploadPhoto(file, { deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'upload_failed' })
    expect(calls).toContain('delete-r2')
  })

  it('rejects a storage key outside the user/media folder', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      signPut: vi.fn(() =>
        Promise.resolve({
          headers: {},
          key: 'other/x/thumb.webp',
          publicUrl: 'u',
          url: 'u',
        }),
      ),
    })
    await expect(
      uploadPhoto(file, { deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'invalid_response' })
    expect(deps.put).not.toHaveBeenCalled()
    expect(calls).toContain('delete-r2')
  })

  it('does not touch the backend when HEIC is rejected', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      processPhoto: vi.fn(() => Promise.reject(new Error('HEIC_UNSUPPORTED'))),
    })
    await expect(
      uploadPhoto(file, { deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'heic_unsupported' })
    expect(calls).toEqual([])
  })

  it('does not clean up when the media row cannot be created', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      createMedia: vi.fn(() =>
        Promise.reject(new MediaUploadError('duplicate')),
      ),
    })
    await expect(
      uploadPhoto(file, { deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'duplicate' })
    expect(calls).toEqual([])
  })
})

describe('toV2VariantKind', () => {
  it('maps full to large and rejects unknown kinds', () => {
    expect(toV2VariantKind('full')).toBe('large')
    expect(toV2VariantKind('thumb')).toBe('thumb')
    expect(toV2VariantKind('video')).toBeNull()
  })
})
