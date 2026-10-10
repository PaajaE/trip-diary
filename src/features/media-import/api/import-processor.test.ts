import { describe, expect, it, vi } from 'vitest'
import { createImportProcessor } from '@/features/media-import/api/import-processor'
import { ImportJobError } from '@/features/media-import/model/import-errors'
import type { MediaSource } from '@/features/media-import/model/types'
import type { UploadJob } from '@/entities/media/model/upload-job'

vi.mock('@/shared/api/supabase', () => ({ getSupabaseClient: vi.fn() }))
vi.mock('@/entities/photo/lib/process-photo', () => ({ processPhoto: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isPluginAvailable: () => true },
  registerPlugin: () => ({}),
}))

const job: UploadJob = {
  attempts: 0,
  byteSize: null,
  capturedAt: '2026-09-11T10:00:00.000Z',
  createdAt: 'x',
  durationMs: null,
  id: 'j|photokit|A',
  journeyId: 'j',
  latitude: 50.08,
  longitude: 14.42,
  mediaType: 'photo',
  ownerId: 'o',
  sourceId: 'A',
  sourceKind: 'photokit',
  state: 'processing',
  updatedAt: 'x',
}

function source() {
  const cleanup = vi.fn(() => Promise.resolve())
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  const open = vi.fn(() => Promise.resolve({ cleanup, file }))
  const src: MediaSource = {
    kind: 'photokit',
    list: () => Promise.resolve([]),
    open,
  }
  return { cleanup, file, open, src }
}

describe('import processor', () => {
  it('opens a photo, uploads it with journey, dedupe id and PhotoKit fallback, then cleans up', async () => {
    const { cleanup, file, src } = source()
    const upload = vi.fn(() => Promise.resolve({ mediaId: 'm1' }))
    const onPhase = vi.fn()
    const run = createImportProcessor({
      getSource: () => src,
      uploadPhoto: upload,
    })
    await expect(run(job, { onPhase })).resolves.toEqual({ mediaId: 'm1' })
    expect(upload).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        fallbackCapture: {
          creationDate: '2026-09-11T10:00:00.000Z',
          latitude: 50.08,
          longitude: 14.42,
        },
        journeyId: 'j',
        ownerId: 'o',
        sourceAssetId: 'A',
      }),
    )
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(onPhase).toHaveBeenCalledWith('exporting', 0)
  })

  it('cleans up when the upload fails and rethrows', async () => {
    const { cleanup, src } = source()
    const run = createImportProcessor({
      getSource: () => src,
      uploadPhoto: () => Promise.reject(new Error('net')),
    })
    await expect(run(job, { onPhase: vi.fn() })).rejects.toThrow('net')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('translates upload progress into phase and fraction', async () => {
    const { src } = source()
    const onPhase = vi.fn()
    const run = createImportProcessor({
      getSource: () => src,
      uploadPhoto: (_file, options) => {
        options.onProgress?.({
          completedVariants: 1,
          phase: 'uploading',
          totalVariants: 4,
        })
        return Promise.resolve({ mediaId: 'm' })
      },
    })
    await run(job, { onPhase })
    expect(onPhase).toHaveBeenLastCalledWith('uploading', 0.25)
  })

  it('sends iOS videos through uploadVideo(assetId) without opening a file', async () => {
    const { open, src } = source()
    const uploadVideo = vi.fn(() => Promise.resolve({ mediaId: 'mv' }))
    const run = createImportProcessor({ getSource: () => src, uploadVideo })
    const video: UploadJob = { ...job, mediaType: 'video' }
    await expect(run(video, { onPhase: vi.fn() })).resolves.toEqual({
      mediaId: 'mv',
    })
    expect(uploadVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'A',
        assetMetadata: {
          creationDate: '2026-09-11T10:00:00.000Z',
          latitude: 50.08,
          longitude: 14.42,
        },
        journeyId: 'j',
        ownerId: 'o',
        sourceAssetId: 'A',
      }),
    )
    expect(open).not.toHaveBeenCalled()
  })

  it('skips web videos and fails photos whose source is gone after a reload', async () => {
    const run = createImportProcessor({ getSource: () => undefined })
    await expect(
      run(
        { ...job, mediaType: 'video', sourceKind: 'web-files' },
        { onPhase: vi.fn() },
      ),
    ).rejects.toMatchObject({
      outcome: 'skip',
      reason: 'web_video_unsupported',
    })
    await expect(run(job, { onPhase: vi.fn() })).rejects.toBeInstanceOf(
      ImportJobError,
    )
    await expect(run(job, { onPhase: vi.fn() })).rejects.toMatchObject({
      outcome: 'fail',
      reason: 'source_unavailable',
    })
  })
})
