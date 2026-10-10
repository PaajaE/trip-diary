import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  addListener: vi.fn(),
  cancelUpload: vi.fn(),
  deleteExport: vi.fn(),
  exportVideo: vi.fn(),
  resumeUploads: vi.fn(),
  uploadParts: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isPluginAvailable: () => true,
  },
  registerPlugin: () => plugin,
}))

import {
  exportVideo,
  onVideoUploadProgress,
  resumeVideoUploads,
  uploadVideoParts,
  VideoPipelineError,
} from '@/shared/lib/video-pipeline'

const exported = {
  byteSize: 1000,
  durationMs: 5000,
  fileUrl: 'file:///tmp/a.mp4',
  height: 1920,
  mimeType: 'video/mp4',
  posterByteSize: 50,
  posterHeight: 1280,
  posterUrl: 'file:///tmp/a.jpg',
  posterWidth: 720,
  width: 1080,
}

describe('video-pipeline', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('parses a valid export result', async () => {
    plugin.exportVideo.mockResolvedValue(exported)
    await expect(exportVideo({ assetId: 'x' })).resolves.toEqual(exported)
  })

  it('rejects a malformed export result', async () => {
    plugin.exportVideo.mockResolvedValue({ ...exported, mimeType: 'video/mov' })
    await expect(exportVideo({ assetId: 'x' })).rejects.toThrow()
  })

  it.each([
    'VIDEO_TOO_LONG',
    'VIDEO_TOO_LARGE',
    'NOT_AUTHORIZED',
    'UPLOAD_FAILED',
  ])('maps native code %s', async (code) => {
    plugin.exportVideo.mockRejectedValue({ code, message: 'native' })
    const error = await exportVideo({ assetId: 'x' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(VideoPipelineError)
    expect((error as VideoPipelineError).code).toBe(code)
  })

  it('maps unknown codes to UNKNOWN', async () => {
    plugin.uploadParts.mockRejectedValue(new Error('boom'))
    const error = await uploadVideoParts({
      fileUrl: 'f',
      parts: [],
      uploadKey: 'k',
    }).catch((e: unknown) => e)
    expect((error as VideoPipelineError).code).toBe('UNKNOWN')
  })

  it('returns upload etags and rejects empty results', async () => {
    plugin.uploadParts.mockResolvedValue({
      parts: [{ etag: 'a', partNumber: 1 }],
    })
    const options = { fileUrl: 'f', parts: [], uploadKey: 'k' }
    await expect(uploadVideoParts(options)).resolves.toEqual([
      { etag: 'a', partNumber: 1 },
    ])
    plugin.uploadParts.mockResolvedValue({ parts: [] })
    await expect(uploadVideoParts(options)).rejects.toThrow()
  })

  it('parses resumed uploads', async () => {
    const upload = {
      bytesSent: 10,
      completedParts: 1,
      parts: [{ etag: 'a', partNumber: 1 }],
      status: 'running',
      totalParts: 2,
      uploadKey: 'k',
    }
    plugin.resumeUploads.mockResolvedValue({ uploads: [upload] })
    await expect(resumeVideoUploads()).resolves.toEqual([upload])
  })

  it('drops malformed progress events', async () => {
    let handler: (event: unknown) => void = () => undefined
    plugin.addListener.mockImplementation(
      (_name: string, fn: (event: unknown) => void) => {
        handler = fn
        return Promise.resolve({ remove: () => Promise.resolve() })
      },
    )
    const seen: unknown[] = []
    await onVideoUploadProgress((p) => seen.push(p))
    handler({ nope: true })
    handler({ bytesSent: 1, completedParts: 0, totalParts: 2, uploadKey: 'k' })
    expect(seen).toHaveLength(1)
  })
})
