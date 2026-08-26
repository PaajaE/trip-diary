import { describe, expect, it } from 'vitest'
import { looksLikeMp4Bytes } from '@trip-diary/utils'
import { isVideoInput, processVideo } from '@/entities/photo/lib/process-video'

describe('isVideoInput', () => {
  it('detects video files by mime type and extension', () => {
    expect(isVideoInput(new File([], 'clip.mp4', { type: 'video/mp4' }))).toBe(
      true,
    )
    expect(
      isVideoInput(new File([], 'clip.MOV', { type: 'video/quicktime' })),
    ).toBe(true)
    expect(
      isVideoInput(new File([], 'photo.jpg', { type: 'image/jpeg' })),
    ).toBe(false)
  })
})

describe('processVideo validation', () => {
  it('rejects files without an MP4 ftyp header', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'fake.mp4', {
      type: 'video/mp4',
    })

    await expect(processVideo(file)).rejects.toThrow('UNSUPPORTED_VIDEO_FORMAT')
  })

  it('rejects non-video inputs', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', {
      type: 'image/jpeg',
    })

    await expect(processVideo(file)).rejects.toThrow('UNSUPPORTED_VIDEO_FORMAT')
  })
})

describe('looksLikeMp4Bytes', () => {
  it('accepts a minimal ftyp header', () => {
    const header = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ])
    expect(looksLikeMp4Bytes(header)).toBe(true)
  })
})
