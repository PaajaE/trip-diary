import { describe, expect, it, vi } from 'vitest'
import { MediaUploadError } from '@/entities/media/model/media'
import {
  buildPartDescriptors,
  resolveVideoCaptureTime,
  uploadVideo,
  type UploadVideoDeps,
  type VideoUploadProgress,
} from '@/features/media-upload/api/upload-video'
import { VideoPipelineError } from '@/shared/lib/video-pipeline'

vi.mock('@/shared/api/supabase', () => ({ getSupabaseClient: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { convertFileSrc: (url: string) => url },
  registerPlugin: vi.fn(() => ({})),
}))

const OWNER = '11111111-1111-4111-8111-111111111111'
const MEDIA = '22222222-2222-4222-8222-222222222222'
const MB = 1024 * 1024
const PART = 8 * MB

const exported = {
  byteSize: 20 * MB,
  durationMs: 12_000,
  fileUrl: 'file:///tmp/v.mp4',
  height: 1080,
  mimeType: 'video/mp4' as const,
  posterByteSize: 5,
  posterHeight: 540,
  posterUrl: 'file:///tmp/p.jpg',
  posterWidth: 960,
  width: 1920,
}

function makeDeps(calls: string[], overrides: Partial<UploadVideoDeps> = {}) {
  const deps: UploadVideoDeps = {
    abortMultipart: vi.fn(() => {
      calls.push('abort')
      return Promise.resolve()
    }),
    addVariant: vi.fn<UploadVideoDeps['addVariant']>((v) => {
      calls.push(`variant:${v.kind}:${v.mimeType}:${v.storageKey}`)
      return Promise.resolve()
    }),
    cancelUpload: vi.fn((key: string) => {
      calls.push(`cancel:${key}`)
      return Promise.resolve()
    }),
    completeMultipart: vi.fn(() => {
      calls.push('complete')
      return Promise.resolve({
        key: `${OWNER}/${MEDIA}/video.mp4`,
        publicUrl: 'https://cdn/video',
      })
    }),
    createMedia: vi.fn<UploadVideoDeps['createMedia']>((m) => {
      calls.push(`create:${m.id}`)
      return Promise.resolve()
    }),
    createMultipart: vi.fn(() => {
      calls.push('mp-create')
      return Promise.resolve({
        key: `${OWNER}/${MEDIA}/video.mp4`,
        partBytes: PART,
        partCount: 3,
        publicUrl: 'https://cdn/video',
        uploadId: 'up1',
      })
    }),
    deleteExportedFiles: vi.fn((urls: string[]) => {
      calls.push(`delete-files:${urls.join(',')}`)
      return Promise.resolve()
    }),
    deleteMedia: vi.fn(() => {
      calls.push('delete-row')
      return Promise.resolve()
    }),
    deleteMediaObjects: vi.fn(() => {
      calls.push('delete-r2')
      return Promise.resolve(1)
    }),
    exportVideo: vi.fn(() => {
      calls.push('export')
      return Promise.resolve(exported)
    }),
    markMediaFailed: vi.fn(() => {
      calls.push('failed')
      return Promise.resolve()
    }),
    markMediaReady: vi.fn(() => {
      calls.push('ready')
      return Promise.resolve()
    }),
    newId: () => MEDIA,
    put: vi.fn((signed: { url: string }) => {
      calls.push(`put:${signed.url}`)
      return Promise.resolve()
    }),
    readFile: vi.fn(() => Promise.resolve(new Blob([new Uint8Array(5)]))),
    signParts: vi.fn<UploadVideoDeps['signParts']>((input) => {
      calls.push(`sign:${input.partNumbers.join(',')}`)
      return Promise.resolve({
        key: `${OWNER}/${MEDIA}/video.mp4`,
        parts: input.partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://r2/part${String(partNumber)}`,
        })),
      })
    }),
    signPut: vi.fn(() => {
      calls.push('sign-poster')
      return Promise.resolve({
        headers: { 'Content-Type': 'image/jpeg' },
        key: `${OWNER}/${MEDIA}/poster.jpg`,
        publicUrl: 'https://cdn/poster',
        url: 'https://r2/poster',
      })
    }),
    subscribeExportProgress: vi.fn(() =>
      Promise.resolve(() => Promise.resolve()),
    ),
    subscribeUploadProgress: vi.fn(() =>
      Promise.resolve(() => Promise.resolve()),
    ),
    uploadParts: vi.fn(() => {
      calls.push('native-upload')
      return Promise.resolve([
        { etag: 'e1', partNumber: 1 },
        { etag: 'e2', partNumber: 2 },
        { etag: 'e3', partNumber: 3 },
      ])
    }),
    ...overrides,
  }
  return deps
}

describe('buildPartDescriptors', () => {
  it('slices consecutive parts with a shorter last part', () => {
    const urls = new Map([
      [1, 'u1'],
      [2, 'u2'],
      [3, 'u3'],
    ])
    expect(buildPartDescriptors(20 * MB, PART, urls)).toEqual([
      { length: PART, offset: 0, partNumber: 1, url: 'u1' },
      { length: PART, offset: PART, partNumber: 2, url: 'u2' },
      { length: 4 * MB, offset: 2 * PART, partNumber: 3, url: 'u3' },
    ])
  })

  it('rejects a missing URL', () => {
    expect(() =>
      buildPartDescriptors(PART + 1, PART, new Map([[1, 'a']])),
    ).toThrow(MediaUploadError)
  })
})

describe('resolveVideoCaptureTime', () => {
  it('has no zone without GPS and no time without creationDate', () => {
    expect(
      resolveVideoCaptureTime({ creationDate: '2026-09-11T10:00:00.000Z' }),
    ).toEqual({ capturedAt: '2026-09-11T10:00:00.000Z', capturedTz: null })
    expect(resolveVideoCaptureTime(undefined)).toEqual({
      capturedAt: null,
      capturedTz: null,
    })
  })

  it('takes the zone from GPS', () => {
    expect(
      resolveVideoCaptureTime({
        creationDate: '2026-09-11T10:00:00.000Z',
        latitude: 50.08,
        longitude: 14.42,
      }),
    ).toEqual({
      capturedAt: '2026-09-11T10:00:00.000Z',
      capturedTz: 'Europe/Prague',
    })
  })
})

describe('uploadVideo', () => {
  it('runs the steps in order and records variants with keys and mimes', async () => {
    const calls: string[] = []
    const phases: VideoUploadProgress['phase'][] = []
    const deps = makeDeps(calls)
    const result = await uploadVideo({
      assetId: 'asset-1',
      assetMetadata: { creationDate: '2026-09-11T10:00:00.000Z' },
      deps,
      onProgress: (p) => {
        if (phases.at(-1) !== p.phase) phases.push(p.phase)
      },
      ownerId: OWNER,
      sourceAssetId: 'asset-1',
    })

    expect(calls).toEqual([
      'export',
      `create:${MEDIA}`,
      'mp-create',
      'sign:1,2,3',
      'native-upload',
      'complete',
      'sign-poster',
      'put:https://r2/poster',
      `variant:video:video/mp4:${OWNER}/${MEDIA}/video.mp4`,
      `variant:poster:image/jpeg:${OWNER}/${MEDIA}/poster.jpg`,
      'ready',
      'delete-files:file:///tmp/v.mp4,file:///tmp/p.jpg',
    ])
    expect(phases).toEqual(['exporting', 'uploading', 'finalizing', 'done'])
    expect(result).toMatchObject({ durationMs: 12_000, mediaId: MEDIA })
    expect(deps.createMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        contentHash: null,
        durationMs: 12_000,
        kind: 'video',
        sourceAssetId: 'asset-1',
      }),
    )
    expect(deps.uploadParts).toHaveBeenCalledWith({
      fileUrl: exported.fileUrl,
      parts: [
        { length: PART, offset: 0, partNumber: 1, url: 'https://r2/part1' },
        { length: PART, offset: PART, partNumber: 2, url: 'https://r2/part2' },
        {
          length: 4 * MB,
          offset: 2 * PART,
          partNumber: 3,
          url: 'https://r2/part3',
        },
      ],
      uploadKey: MEDIA,
    })
    expect(deps.completeMultipart).toHaveBeenCalledWith({
      mediaId: MEDIA,
      parts: [
        { etag: 'e1', partNumber: 1 },
        { etag: 'e2', partNumber: 2 },
        { etag: 'e3', partNumber: 3 },
      ],
      uploadId: 'up1',
    })
  })

  it('maps VIDEO_TOO_LONG without any backend call and still cleans nothing', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      exportVideo: vi.fn(() =>
        Promise.reject(new VideoPipelineError('VIDEO_TOO_LONG', 'long')),
      ),
    })
    const error = await uploadVideo({
      assetId: 'a',
      deps,
      ownerId: OWNER,
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(MediaUploadError)
    expect((error as MediaUploadError).code).toBe('video_too_long')
    expect(deps.createMedia).not.toHaveBeenCalled()
    expect(deps.createMultipart).not.toHaveBeenCalled()
  })

  it('maps other export failures to export_failed', async () => {
    const deps = makeDeps([], {
      exportVideo: vi.fn(() =>
        Promise.reject(new VideoPipelineError('ASSET_UNAVAILABLE', 'x')),
      ),
    })
    await expect(
      uploadVideo({ assetId: 'a', deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'export_failed' })
  })

  it('deletes the R2 folder and the row when the upload fails, rethrowing the original error', async () => {
    const calls: string[] = []
    const original = new VideoPipelineError('UPLOAD_FAILED', 'net')
    const deps = makeDeps(calls, {
      uploadParts: vi.fn(() => Promise.reject(original)),
    })
    const error = await uploadVideo({
      assetId: 'a',
      deps,
      ownerId: OWNER,
    }).catch((caught: unknown) => caught)
    expect((error as MediaUploadError).code).toBe('upload_failed')
    expect((error as MediaUploadError).cause).toBe(original)
    expect(calls).toEqual([
      'export',
      `create:${MEDIA}`,
      'mp-create',
      'sign:1,2,3',
      `cancel:${MEDIA}`,
      'abort',
      'failed',
      'delete-r2',
      'delete-row',
      'delete-files:file:///tmp/v.mp4,file:///tmp/p.jpg',
    ])
  })

  it('keeps the failed row when R2 cleanup fails', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      completeMultipart: vi.fn(() =>
        Promise.reject(new MediaUploadError('upload_failed', 'complete')),
      ),
      deleteMediaObjects: vi.fn(() =>
        Promise.reject(new MediaUploadError('delete_failed')),
      ),
    })
    await expect(
      uploadVideo({ assetId: 'a', deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'upload_failed', message: 'complete' })
    expect(deps.markMediaFailed).toHaveBeenCalledWith(MEDIA)
    expect(deps.deleteMedia).not.toHaveBeenCalled()
    expect(deps.deleteExportedFiles).toHaveBeenCalled()
  })

  it('rejects a storage key outside the owner folder', async () => {
    const deps = makeDeps([], {
      createMultipart: vi.fn(() =>
        Promise.resolve({
          key: 'other/x/video.mp4',
          partBytes: PART,
          partCount: 3,
          publicUrl: 'u',
          uploadId: 'up1',
        }),
      ),
    })
    await expect(
      uploadVideo({ assetId: 'a', deps, ownerId: OWNER }),
    ).rejects.toMatchObject({ code: 'invalid_response' })
    expect(deps.uploadParts).not.toHaveBeenCalled()
  })
})
