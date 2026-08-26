import { describe, expect, it } from 'vitest'
import {
  buildVideoPosterStoragePath,
  buildVideoStoragePath,
  estimateCanonicalVideoBytes,
  looksLikeMp4Bytes,
  VIDEO_MAX_CANONICAL_BYTES,
  VIDEO_MAX_DURATION_SECONDS,
} from './media-video'

describe('media-video', () => {
  it('builds deterministic video and poster paths', () => {
    const creatorId = '00000000-0000-4000-8000-000000000001'
    const mediaId = '40000000-0000-4000-8000-000000000002'
    expect(buildVideoStoragePath(creatorId, mediaId)).toBe(
      `${creatorId}/${mediaId}/video.mp4`,
    )
    expect(buildVideoPosterStoragePath(creatorId, mediaId, 'small')).toBe(
      `${creatorId}/${mediaId}/small.jpg`,
    )
    expect(buildVideoPosterStoragePath(creatorId, mediaId, 'thumb')).toBe(
      `${creatorId}/${mediaId}/thumb.jpg`,
    )
  })

  it('detects MP4 ftyp header', () => {
    const header = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ])
    expect(looksLikeMp4Bytes(header)).toBe(true)
    expect(looksLikeMp4Bytes(new Uint8Array([0x00, 0x00]))).toBe(false)
  })

  it('documents product limits', () => {
    expect(VIDEO_MAX_DURATION_SECONDS).toBe(180)
    expect(VIDEO_MAX_CANONICAL_BYTES).toBe(80 * 1024 * 1024)
    expect(estimateCanonicalVideoBytes(60)).toBeGreaterThan(15 * 1024 * 1024)
    expect(estimateCanonicalVideoBytes(60)).toBeLessThan(30 * 1024 * 1024)
  })
})
