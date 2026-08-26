import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('expo-file-system', () => ({
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 100 })),
  deleteAsync: vi.fn(async () => {}),
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: vi.fn(async () => 'cGhvdG8='),
}))

vi.mock('@/platform/media/photo', () => ({
  generateThumbJpeg: vi.fn(async () => {
    throw new Error('thumb mock')
  }),
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
  insertVariant: ReturnType<typeof vi.fn>
  upload: ReturnType<typeof vi.fn>
} {
  const upload = vi.fn(
    async (_path: string, _bytes: ArrayBuffer, _options: unknown) => ({
      error: null,
    }),
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
          insert: vi.fn(async () => ({ error: null })),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
    storage: {
      from: vi.fn(() => ({
        list: vi.fn(async () => ({
          data: [{ metadata: { size: 120_000 }, name: 'preview.jpg' }],
          error: null,
        })),
        upload,
      })),
    },
  } as unknown as SupabaseClient

  const photoBytes = new TextEncoder().encode('photo-bytes').buffer

  return {
    deps: {
      cleanupLocalFiles: vi.fn(async () => {}),
      generateThumb: vi.fn(async () => {
        throw new Error('thumb skipped in unit test')
      }),
      getClient: () => client,
      getLocalFileByteSize: vi.fn(async () => 120_000),
      localFileExists: vi.fn(async () => true),
      readLocalFileBytes: vi.fn(async () => photoBytes),
      verifyRemoteObjectByteSize: vi.fn(async () => 120_000),
      ...overrides,
    },
    insertPhoto,
    insertVariant,
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
    expect(parsePhotoUploadPayload(createValidPayload())).toMatchObject({
      byteSize: 120_000,
      capturedAt: '2026:07:10 14:30:00',
      entryId: null,
      height: 1080,
      isCover: false,
      journeyId: 'journey-1',
      latitude: null,
      localUri: 'file:///mock/documents/photos/test.jpg',
      longitude: null,
      mimeType: 'image/jpeg',
      originalFilename: 'test.jpg',
      photoId: '40000000-0000-4000-8000-000000000099',
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

  it('uploads photo bytes as ArrayBuffer, not Blob', async () => {
    const { deps, upload } = createDeps()

    const result = await processPhotoUploadOperation(createValidPayload(), deps)

    expect(result).toEqual({
      photoId: '40000000-0000-4000-8000-000000000099',
      storagePath: 'user-1/40000000-0000-4000-8000-000000000099/preview.jpg',
      thumbStoragePath: null,
      thumbUploadError: 'thumb skipped in unit test',
    })
    expect(upload).toHaveBeenCalledWith(
      'user-1/40000000-0000-4000-8000-000000000099/preview.jpg',
      expect.any(ArrayBuffer),
      {
        contentType: 'image/jpeg',
        upsert: true,
      },
    )
    const uploaded = upload.mock.calls[0]?.[1] as ArrayBuffer
    expect(uploaded.byteLength).toBeGreaterThan(0)
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
      async (_path: string, _bytes: ArrayBuffer, _options: unknown) => ({
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
          return { insert: vi.fn(async () => ({ error: null })) }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
      storage: {
        from: vi.fn(() => ({ upload })),
      },
    } as unknown as SupabaseClient

    await processPhotoUploadOperation(createValidPayload(), {
      getClient: () => client,
      getLocalFileByteSize: vi.fn(async () => 120_000),
      localFileExists: vi.fn(async () => true),
      readLocalFileBytes: vi.fn(
        async () => new TextEncoder().encode('photo-bytes').buffer,
      ),
      verifyRemoteObjectByteSize: vi.fn(async () => 120_000),
      generateThumb: vi.fn(async () => {
        throw new Error('skip thumb')
      }),
      cleanupLocalFiles: vi.fn(async () => {}),
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

  it('fails before reading bytes when the file exceeds the Storage limit', async () => {
    const readLocalFileBytes = vi.fn(
      async () => new TextEncoder().encode('photo-bytes').buffer,
    )
    const { deps, upload } = createDeps({
      getLocalFileByteSize: vi.fn(
        async () => PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES + 1,
      ),
      readLocalFileBytes,
    })

    await expect(
      processPhotoUploadOperation(createValidPayload(), deps),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        String(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES),
      ),
      retryable: false,
    })

    expect(readLocalFileBytes).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses to upload zero-byte payloads', async () => {
    const { deps } = createDeps({
      readLocalFileBytes: vi.fn(async () => new ArrayBuffer(0)),
    })

    await expect(
      processPhotoUploadOperation(createValidPayload(), deps),
    ).rejects.toMatchObject({
      message: expect.stringContaining('zero bytes'),
      retryable: false,
    })
  })

  it('proceeds when the file is exactly at the Storage limit', async () => {
    const { deps, upload } = createDeps({
      getLocalFileByteSize: vi.fn(
        async () => PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES,
      ),
      readLocalFileBytes: vi.fn(
        async () => new ArrayBuffer(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES),
      ),
    })

    await processPhotoUploadOperation(createValidPayload(), deps)

    expect(upload).toHaveBeenCalled()
  })

  it('retries against the same storage path without creating a duplicate object', async () => {
    const upload = vi.fn(
      async (_path: string, _bytes: ArrayBuffer, _options: unknown) => ({
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
              return { insert: vi.fn(async () => ({ error: null })) }
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

  it('links photos to entries with insert instead of upsert', async () => {
    const insertEntryPhoto = vi.fn(async () => ({ error: null }))
    const rpc = vi.fn(async () => ({ error: null }))
    const insertPhoto = vi.fn(async () => ({ error: null }))
    const insertVariant = vi.fn(async () => ({ error: null }))
    const upload = vi.fn(
      async (_path: string, _bytes: ArrayBuffer, _options: unknown) => ({
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
          return { insert: insertPhoto }
        }
        if (table === 'photo_variants') {
          return { insert: insertVariant }
        }
        if (table === 'entry_photos') {
          return { insert: insertEntryPhoto }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
      rpc,
      storage: {
        from: vi.fn(() => ({ upload })),
      },
    } as unknown as SupabaseClient

    await processPhotoUploadOperation(
      {
        ...createValidPayload(),
        entryId: '10000000-0000-4000-8000-000000000001',
        isCover: true,
        position: 0,
      },
      {
        getClient: () => client,
        getLocalFileByteSize: vi.fn(async () => 120_000),
        localFileExists: vi.fn(async () => true),
        readLocalFileBytes: vi.fn(
          async () => new TextEncoder().encode('photo-bytes').buffer,
        ),
        verifyRemoteObjectByteSize: vi.fn(async () => 120_000),
        generateThumb: vi.fn(async () => {
          throw new Error('skip thumb')
        }),
        cleanupLocalFiles: vi.fn(async () => {}),
      },
    )

    expect(insertEntryPhoto).toHaveBeenCalledWith({
      creator_id: 'user-1',
      entry_id: '10000000-0000-4000-8000-000000000001',
      photo_id: '40000000-0000-4000-8000-000000000099',
      position: 0,
    })
    expect(rpc).toHaveBeenCalledWith('set_entry_photo_cover', {
      p_entry_id: '10000000-0000-4000-8000-000000000001',
      p_photo_id: '40000000-0000-4000-8000-000000000099',
    })
  })

  it('on duplicate entry_photos row, updates only position', async () => {
    const updateEqCreator = vi.fn(async () => ({ error: null }))
    const updateEqPhoto = vi.fn(() => ({ eq: updateEqCreator }))
    const updateEqEntry = vi.fn(() => ({ eq: updateEqPhoto }))
    const updateEntryPhoto = vi.fn(() => ({ eq: updateEqEntry }))
    const insertEntryPhoto = vi.fn(async () => ({
      error: { message: 'duplicate key value violates unique constraint' },
    }))
    const rpc = vi.fn(async () => ({ error: null }))

    const client = {
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
          return { insert: vi.fn(async () => ({ error: null })) }
        }
        if (table === 'entry_photos') {
          return { insert: insertEntryPhoto, update: updateEntryPhoto }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
      rpc,
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async () => ({ error: null })),
        })),
      },
    } as unknown as SupabaseClient

    await processPhotoUploadOperation(
      {
        ...createValidPayload(),
        entryId: '10000000-0000-4000-8000-000000000001',
        isCover: false,
        position: 2,
      },
      {
        getClient: () => client,
        getLocalFileByteSize: vi.fn(async () => 120_000),
        localFileExists: vi.fn(async () => true),
        readLocalFileBytes: vi.fn(
          async () => new TextEncoder().encode('photo-bytes').buffer,
        ),
        verifyRemoteObjectByteSize: vi.fn(async () => 120_000),
        generateThumb: vi.fn(async () => {
          throw new Error('skip thumb')
        }),
        cleanupLocalFiles: vi.fn(async () => {}),
      },
    )

    expect(updateEntryPhoto).toHaveBeenCalledWith({ position: 2 })
    expect(updateEqEntry).toHaveBeenCalledWith(
      'entry_id',
      '10000000-0000-4000-8000-000000000001',
    )
    expect(rpc).not.toHaveBeenCalled()
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

  it('does not declare a photo_variants row when Storage upload fails', async () => {
    const insertVariant = vi.fn(async () => ({ error: null }))
    const upload = vi.fn(async () => ({
      error: { message: 'network failed', status: 503 },
    }))
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
              return { insert: insertVariant }
            }
            if (table === 'entry_photos') {
              return { insert: vi.fn(async () => ({ error: null })) }
            }
            throw new Error(`Unexpected table: ${table}`)
          }),
          storage: {
            from: vi.fn(() => ({ upload })),
          },
        }) as unknown as SupabaseClient,
    })

    await expect(
      processPhotoUploadOperation(createValidPayload(), deps),
    ).rejects.toMatchObject({
      message: 'network failed',
      retryable: true,
    })
    expect(insertVariant).not.toHaveBeenCalled()
  })

  it('rejects a successful upload that verifies as zero bytes', async () => {
    const insertVariant = vi.fn(async () => ({ error: null }))
    const { deps } = createDeps({
      verifyRemoteObjectByteSize: vi.fn(async () => 0),
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
              return { insert: insertVariant }
            }
            if (table === 'entry_photos') {
              return { insert: vi.fn(async () => ({ error: null })) }
            }
            throw new Error(`Unexpected table: ${table}`)
          }),
          storage: {
            from: vi.fn(() => ({
              upload: vi.fn(async () => ({ error: null })),
            })),
          },
        }) as unknown as SupabaseClient,
    })

    await expect(
      processPhotoUploadOperation(createValidPayload(), deps),
    ).rejects.toMatchObject({
      message: expect.stringContaining('empty after upload'),
    })
    expect(insertVariant).not.toHaveBeenCalled()
  })

  it('keeps master success when thumbnail generation/upload fails', async () => {
    const { deps, insertVariant, upload } = createDeps({
      generateThumb: vi.fn(async () => {
        throw new Error('cannot make thumb')
      }),
    })

    const result = await processPhotoUploadOperation(createValidPayload(), deps)

    expect(result.storagePath).toContain('/preview.jpg')
    expect(result.thumbStoragePath).toBeNull()
    expect(result.thumbUploadError).toContain('cannot make thumb')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(insertVariant).toHaveBeenCalledTimes(1)
  })
})
