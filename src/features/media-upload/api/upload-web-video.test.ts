import { describe, expect, it, vi } from 'vitest'
import type { UploadVideoDeps } from '@/features/media-upload/api/upload-video'
import {
  uploadWebVideo,
  type WebVideoDeps,
  type WebVideoProbe,
} from '@/features/media-upload/api/upload-web-video'

vi.mock('@/shared/api/supabase', () => ({ getSupabaseClient: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { convertFileSrc: (url: string) => url },
  registerPlugin: vi.fn(() => ({})),
}))

const OWNER = '11111111-1111-4111-8111-111111111111'
const MEDIA = '22222222-2222-4222-8222-222222222222'
const PART = 4

const probe: WebVideoProbe = {
  durationMs: 12_000,
  height: 1080,
  poster: new Blob([new Uint8Array(3)], { type: 'image/jpeg' }),
  posterHeight: 720,
  posterWidth: 1280,
  width: 1920,
}

function file(size = 10, type = 'video/mp4'): File {
  return new File([new Uint8Array(size)], 'v.mp4', { type })
}

function setup(
  options: {
    etag?: string | null
    probeResult?: WebVideoProbe
    status?: number
  } = {},
) {
  const calls: string[] = []
  const sizes: number[] = []
  const web: Partial<WebVideoDeps> = {
    createObjectUrl: vi.fn((blob: Blob) => `blob:${String(blob.size)}`),
    fetchPart: vi.fn((url: string, body: Blob) => {
      calls.push(`put:${url}`)
      sizes.push(body.size)
      return Promise.resolve({
        etag: options.etag === undefined ? `"etag-${url}"` : options.etag,
        ok: (options.status ?? 200) < 400,
        status: options.status ?? 200,
      })
    }),
    probe: vi.fn(() => Promise.resolve(options.probeResult ?? probe)),
    revokeObjectUrl: vi.fn((url: string) => {
      calls.push(`revoke:${url}`)
    }),
  }
  const completeMultipart = vi.fn<UploadVideoDeps['completeMultipart']>(() =>
    Promise.resolve({
      key: `${OWNER}/${MEDIA}/video.mp4`,
      publicUrl: 'https://cdn/video',
    }),
  )
  const deps: Partial<UploadVideoDeps> = {
    abortMultipart: vi.fn(() => Promise.resolve()),
    addVariant: vi.fn(() => Promise.resolve()),
    completeMultipart,
    createMedia: vi.fn(() => Promise.resolve()),
    createMultipart: vi.fn(() =>
      Promise.resolve({
        key: `${OWNER}/${MEDIA}/video.mp4`,
        partBytes: PART,
        partCount: 3,
        publicUrl: 'https://cdn/video',
        uploadId: 'up1',
      }),
    ),
    deleteMedia: vi.fn(() => Promise.resolve()),
    deleteMediaObjects: vi.fn(() => Promise.resolve(1)),
    markMediaFailed: vi.fn(() => Promise.resolve()),
    markMediaReady: vi.fn(() => Promise.resolve()),
    newId: () => MEDIA,
    put: vi.fn(() => Promise.resolve()),
    signParts: vi.fn(() =>
      Promise.resolve({
        key: `${OWNER}/${MEDIA}/video.mp4`,
        parts: [1, 2, 3].map((n) => ({ partNumber: n, url: `u${String(n)}` })),
      }),
    ),
    signPut: vi.fn(() =>
      Promise.resolve({
        headers: {},
        key: `${OWNER}/${MEDIA}/poster.jpg`,
        publicUrl: 'https://cdn/poster',
        url: 'https://put/poster',
      }),
    ),
  }
  return { calls, completeMultipart, deps, sizes, web }
}

describe('uploadWebVideo', () => {
  it('PUTs file slices sequentially, completes with the ETags and cleans up', async () => {
    const { calls, completeMultipart, deps, sizes, web } = setup()
    const progress: number[] = []
    const result = await uploadWebVideo(
      file(10),
      {
        assetId: 'a',
        onProgress: (p) => {
          if (p.phase === 'uploading') progress.push(p.bytesSent)
        },
        ownerId: OWNER,
      },
      { deps, web },
    )
    expect(result.mediaId).toBe(MEDIA)
    expect(sizes).toEqual([4, 4, 2])
    expect(calls.filter((c) => c.startsWith('put:'))).toEqual([
      'put:u1',
      'put:u2',
      'put:u3',
    ])
    expect(completeMultipart).toHaveBeenCalledWith({
      mediaId: MEDIA,
      parts: [
        { etag: '"etag-u1"', partNumber: 1 },
        { etag: '"etag-u2"', partNumber: 2 },
        { etag: '"etag-u3"', partNumber: 3 },
      ],
      uploadId: 'up1',
    })
    expect(progress).toEqual(expect.arrayContaining([4, 8, 10]))
    expect(calls.filter((c) => c.startsWith('revoke:'))).toHaveLength(2)
  })

  it('fails with a clear message when the ETag header is not readable', async () => {
    const { deps, web } = setup({ etag: null })
    await expect(
      uploadWebVideo(file(10), { assetId: 'a', ownerId: OWNER }, { deps, web }),
    ).rejects.toMatchObject({
      code: 'upload_failed',
      message: expect.stringContaining('ExposeHeaders: ETag'),
    })
    expect(deps.abortMultipart).toHaveBeenCalled()
    expect(deps.markMediaFailed).toHaveBeenCalled()
  })

  it('fails on a non-2xx part response', async () => {
    const { deps, web } = setup({ status: 403 })
    await expect(
      uploadWebVideo(file(10), { assetId: 'a', ownerId: OWNER }, { deps, web }),
    ).rejects.toMatchObject({ code: 'upload_failed' })
  })

  it('rejects videos longer than the server limit before creating a row', async () => {
    const { deps, web } = setup({
      probeResult: { ...probe, durationMs: 61_000 },
    })
    await expect(
      uploadWebVideo(file(10), { assetId: 'a', ownerId: OWNER }, { deps, web }),
    ).rejects.toMatchObject({ code: 'video_too_long' })
    expect(deps.createMedia).not.toHaveBeenCalled()
  })

  it('rejects oversize files and non-mp4 without probing', async () => {
    const { deps, web } = setup()
    const big = file(1)
    Object.defineProperty(big, 'size', { value: 121 * 1024 * 1024 })
    await expect(
      uploadWebVideo(big, { assetId: 'a', ownerId: OWNER }, { deps, web }),
    ).rejects.toMatchObject({ code: 'video_too_large' })
    await expect(
      uploadWebVideo(
        file(10, 'video/quicktime'),
        { assetId: 'a', ownerId: OWNER },
        { deps, web },
      ),
    ).rejects.toMatchObject({ code: 'processing_failed' })
    expect(web.probe).not.toHaveBeenCalled()
  })
})
