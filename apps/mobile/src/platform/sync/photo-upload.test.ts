import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('expo-file-system', () => ({
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 100 })),
}))

vi.mock('@/platform/supabase', () => ({
  getSupabaseClient: vi.fn(),
  isSupabaseConfigured: vi.fn(() => true),
}))

import {
  assertPhotoFileWithinStorageLimit,
  buildPhotoStoragePath,
  classifySupabaseError,
  parsePhotoUploadPayload,
  PhotoUploadError,
  processPhotoUploadOperation,
  type PhotoUploadDeps,
} from './photo-upload'
import { PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES } from './photo-storage-limits'

function createValidPayload(): Record<string, unknown> {
  return {
    byteSize: 120_000,
    capturedAt: '2026:07:10 14:30:00',
    height: 1080,
    journeyId: 'journey-1',
    localUri: 'file:///mock/documents/photos/test.jpg',
    mimeType: 'image/jpeg',
    originalFilename: 'test.jpg',
    photoId: '40000000-0000-4000-8000-000000000099',
    variant: 'preview',
    width: 1920,
  }
}

function createDeps(overrides: Partial<PhotoUploadDeps> = {}): {
  deps: PhotoUploadDeps
  insertPhoto: ReturnType<typeof vi.fn>
  upload: ReturnType<typeof vi.fn>
} {
  const upload = vi.fn(
    async (_path: string, _blob: Blob, _options: unknown) => ({ error: null }),
  )
  const insertPhoto = vi.fn(async () => ({ error: null }))
  const insertVariant = vi.fn(async () => ({ error: null }))
  const updateVariant = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    })),
  }))

  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'photos') {
        return {
          insert: insertPhoto,
        }
      }

      if (table === 'photo_variants') {
        return {
          insert: insertVariant,
          update: updateVariant,
        }
      }

      if (table === 'entry_photos') {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
    storage: {
      from: vi.fn(() => ({
        upload,
      })),
    },
  } as unknown as SupabaseClient

  return {
    deps: {
      fetchLocalFile: vi.fn(
        async () => new Blob(['photo-bytes'], { type: 'image/jpeg' }),
      ),
      getClient: () => client,
      getLocalFileByteSize: vi.fn(async () => 120_000),
      localFileExists: vi.fn(async () => true),
      ...overrides,
    },
    insertPhoto,
    upload,
  }
}

describe('photo upload contract', () => {
  it('builds canonical storage paths', () => {
    expect(
      buildPhotoStoragePath('user-1', 'photo-1', 'preview', 'image/jpeg'),
    ).toBe('user-1/photo-1/preview.jpg')
    expect(
      buildPhotoStoragePath('user-1', 'photo-1', 'thumb', 'image/webp'),
    ).toBe('user-1/photo-1/thumb.webp')
  })

  it('parses valid upload payloads', () => {
    expect(parsePhotoUploadPayload(createValidPayload())).toEqual({
      byteSize: 120_000,
      capturedAt: '2026:07:10 14:30:00',
      entryId: null,
      height: 1080,
      journeyId: 'journey-1',
      latitude: null,
      localUri: 'file:///mock/documents/photos/test.jpg',
      longitude: null,
      mimeType: 'image/jpeg',
      originalFilename: 'test.jpg',
      photoId: '40000000-0000-4000-8000-000000000099',
      position: undefined,
      variant: 'preview',
      width: 1920,
    })
  })

  it('rejects malformed upload payloads', () => {
    expect(() =>
      parsePhotoUploadPayload({
        ...createValidPayload(),
        photoId: '',
      }),
    ).toThrow('Invalid photo upload payload: photoId')

    expect(() =>
      parsePhotoUploadPayload({
        ...createValidPayload(),
        photoId: 'not-a-uuid',
      }),
    ).toThrow('Invalid photo upload payload: photoId')
  })
})

describe('assertPhotoFileWithinStorageLimit', () => {
  it('allows files under and exactly at the bucket limit', () => {
    expect(() =>
      assertPhotoFileWithinStorageLimit(
        PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES - 1,
      ),
    ).not.toThrow()
    expect(() =>
      assertPhotoFileWithinStorageLimit(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES),
    ).not.toThrow()
  })

  it('rejects files over the bucket limit as non-retryable', () => {
    expect(() =>
      assertPhotoFileWithinStorageLimit(
        PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES + 1,
      ),
    ).toThrow(PhotoUploadError)

    try {
      assertPhotoFileWithinStorageLimit(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES + 1)
    } catch (error) {
      expect(error).toMatchObject({
        message: expect.stringContaining(
          String(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES),
        ),
        retryable: false,
      })
    }
  })
})

describe('classifySupabaseError', () => {
  it('marks obvious permanent Postgres and metadata failures as non-retryable', () => {
    expect(
      classifySupabaseError({ code: '22P02', message: 'invalid uuid' }),
    ).toMatchObject({
      retryable: false,
    })
    expect(
      classifySupabaseError({ code: '22007', message: 'invalid timestamp' }),
    ).toMatchObject({
      retryable: false,
    })
    expect(
      classifySupabaseError({ code: '23505', message: 'duplicate key' }),
    ).toMatchObject({
      retryable: false,
    })
  })

  it('marks RLS and storage size rejections as non-retryable', () => {
    expect(
      classifySupabaseError({
        status: 403,
        message: 'new row violates row-level security policy',
      }),
    ).toMatchObject({ retryable: false })
    expect(
      classifySupabaseError({ status: 413, message: 'Payload too large' }),
    ).toMatchObject({ retryable: false })
  })

  it('keeps network, timeout, and 5xx failures retryable', () => {
    expect(
      classifySupabaseError({ message: 'Network request failed' }),
    ).toMatchObject({
      retryable: true,
    })
    expect(
      classifySupabaseError({ message: 'fetch failed due to timeout' }),
    ).toMatchObject({
      retryable: true,
    })
    expect(
      classifySupabaseError({ status: 503, message: 'Service unavailable' }),
    ).toMatchObject({
      retryable: true,
    })
  })

  it('keeps expired auth retryable and unknown errors retryable by default', () => {
    expect(
      classifySupabaseError({ status: 401, message: 'JWT expired' }),
    ).toMatchObject({
      retryable: true,
    })
    expect(
      classifySupabaseError({ message: 'Something unexpected happened' }),
    ).toMatchObject({
      retryable: true,
    })
  })
})

describe('processPhotoUploadOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads a photo and returns the remote storage path', async () => {
    const { deps, upload } = createDeps()

    const result = await processPhotoUploadOperation(createValidPayload(), deps)

    expect(result).toEqual({
      photoId: '40000000-0000-4000-8000-000000000099',
      storagePath: 'user-1/40000000-0000-4000-8000-000000000099/preview.jpg',
    })
    expect(upload).toHaveBeenCalledWith(
      'user-1/40000000-0000-4000-8000-000000000099/preview.jpg',
      expect.any(Blob),
      {
        contentType: 'image/jpeg',
        upsert: true,
      },
    )
  })

  it('inserts photo metadata without upserting protected identity columns', async () => {
    const { deps, insertPhoto } = createDeps()

    await processPhotoUploadOperation(createValidPayload(), deps)

    expect(insertPhoto).toHaveBeenCalledTimes(1)
    expect(insertPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        captured_at: expect.stringMatching(/^2026-07-10T\d{2}:30:00\.\d{3}Z$/),
        creator_id: 'user-1',
        id: '40000000-0000-4000-8000-000000000099',
        latitude: null,
        longitude: null,
      }),
    )
  })

  it('upload succeeds with malformed capturedAt and writes null to photos.captured_at', async () => {
    const { deps, insertPhoto, upload } = createDeps()

    const result = await processPhotoUploadOperation(
      {
        ...createValidPayload(),
        capturedAt: 'not-a-date',
      },
      deps,
    )

    expect(result.storagePath).toContain('preview.jpg')
    expect(insertPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ captured_at: null }),
    )
    expect(upload).toHaveBeenCalled()
  })

  it('on duplicate photos row, updates only allowed metadata columns', async () => {
    const updateEqCreator = vi.fn(async () => ({ error: null }))
    const updateEqId = vi.fn(() => ({ eq: updateEqCreator }))
    const updatePhoto = vi.fn(() => ({ eq: updateEqId }))
    const insertPhoto = vi.fn(async () => ({
      error: { message: 'duplicate key value violates unique constraint' },
    }))
    const insertVariant = vi.fn(async () => ({ error: null }))
    const upload = vi.fn(
      async (_path: string, _blob: Blob, _options: unknown) => ({
        error: null,
      }),
    )

    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: 'user-1' } } },
          error: null,
        })),
      },
      from: vi.fn((table: string) => {
        if (table === 'photos') {
          return { insert: insertPhoto, update: updatePhoto }
        }
        if (table === 'photo_variants') {
          return { insert: insertVariant }
        }
        if (table === 'entry_photos') {
          return { upsert: vi.fn(async () => ({ error: null })) }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({ upload })),
      },
    } as unknown as SupabaseClient

    await processPhotoUploadOperation(createValidPayload(), {
      fetchLocalFile: vi.fn(async () => new Blob(['photo-bytes'])),
      getClient: () => client,
      getLocalFileByteSize: vi.fn(async () => 120_000),
      localFileExists: vi.fn(async () => true),
    })

    expect(updatePhoto).toHaveBeenCalledWith({
      captured_at: expect.stringMatching(/^2026-07-10T/),
      latitude: null,
      longitude: null,
    })
    expect(updateEqId).toHaveBeenCalledWith(
      'id',
      '40000000-0000-4000-8000-000000000099',
    )
    expect(updateEqCreator).toHaveBeenCalledWith('creator_id', 'user-1')
  })

  it('keeps retryable failures for auth errors', async () => {
    const { deps } = createDeps({
      getClient: () =>
        ({
          auth: {
            getSession: vi.fn(async () => ({
              data: { session: null },
              error: null,
            })),
          },
        }) as unknown as SupabaseClient,
    })

    await expect(
      processPhotoUploadOperation(createValidPayload(), deps),
    ).rejects.toMatchObject({
      message: 'Authentication required before photo upload.',
      retryable: true,
    })
  })

  it('rejects queued photos owned by a different user as terminal failures', async () => {
    const { deps } = createDeps()

    await expect(
      processPhotoUploadOperation(
        {
          ...createValidPayload(),
          enqueuedByUserId: 'other-user',
        },
        deps,
      ),
    ).rejects.toMatchObject({
      message: 'Queued photo belongs to a different signed-in account.',
      retryable: false,
    })
  })

  it('marks missing local files as terminal failures', async () => {
    const { deps } = createDeps({
      localFileExists: vi.fn(async () => false),
    })

    await expect(
      processPhotoUploadOperation(createValidPayload(), deps),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Local photo file is missing'),
      retryable: false,
    })
  })

  it('fails before Blob creation when the file exceeds the Storage limit', async () => {
    const fetchLocalFile = vi.fn(async () => new Blob(['photo-bytes']))
    const { deps, upload } = createDeps({
      fetchLocalFile,
      getLocalFileByteSize: vi.fn(
        async () => PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES + 1,
      ),
    })

    await expect(
      processPhotoUploadOperation(createValidPayload(), deps),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        String(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES),
      ),
      retryable: false,
    })

    expect(fetchLocalFile).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('proceeds when the file is exactly at the Storage limit', async () => {
    const { deps, upload } = createDeps({
      getLocalFileByteSize: vi.fn(
        async () => PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES,
      ),
    })

    await processPhotoUploadOperation(createValidPayload(), deps)

    expect(upload).toHaveBeenCalled()
  })

  it('retries against the same storage path without creating a duplicate object', async () => {
    const upload = vi.fn(
      async (_path: string, _blob: Blob, _options: unknown) => ({
        error: null,
      }),
    )
    const { deps } = createDeps({
      getClient: () =>
        ({
          auth: {
            getSession: vi.fn(async () => ({
              data: { session: { user: { id: 'user-1' } } },
              error: null,
            })),
          },
          from: vi.fn((table: string) => {
            if (table === 'photos') {
              return { insert: vi.fn(async () => ({ error: null })) }
            }

            if (table === 'photo_variants') {
              return {
                insert: vi.fn(async () => ({
                  error: {
                    message: 'duplicate key value violates unique constraint',
                  },
                })),
                update: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      eq: vi.fn(async () => ({ error: null })),
                    })),
                  })),
                })),
              }
            }

            if (table === 'entry_photos') {
              return { upsert: vi.fn(async () => ({ error: null })) }
            }

            throw new Error(`Unexpected table: ${table}`)
          }),
          storage: {
            from: vi.fn(() => ({ upload })),
          },
        }) as unknown as SupabaseClient,
    })

    const payload = createValidPayload()
    const first = await processPhotoUploadOperation(payload, deps)
    const second = await processPhotoUploadOperation(payload, deps)

    expect(first.storagePath).toBe(second.storagePath)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload.mock.calls[0]?.[0]).toEqual(upload.mock.calls[1]?.[0])
  })

  it('does not throw for malformed payloads and instead returns terminal PhotoUploadError', async () => {
    const { deps } = createDeps()

    await expect(
      processPhotoUploadOperation({ journeyId: 'only-journey' }, deps),
    ).rejects.toBeInstanceOf(PhotoUploadError)

    await expect(
      processPhotoUploadOperation({ journeyId: 'only-journey' }, deps),
    ).rejects.toMatchObject({
      retryable: false,
    })
  })
})
