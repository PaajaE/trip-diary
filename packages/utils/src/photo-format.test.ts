import { describe, expect, it } from 'vitest'
import {
  isHeicLikeImageInput,
  looksLikeHeicBytes,
  looksLikeJpegBytes,
  looksLikeWebpBytes,
} from './photo-format'

describe('isHeicLikeImageInput', () => {
  it('detects HEIC mime and extension', () => {
    expect(isHeicLikeImageInput({ mimeType: 'image/heic' })).toBe(true)
    expect(isHeicLikeImageInput({ nameOrUri: 'IMG_0001.HEIC' })).toBe(true)
    expect(
      isHeicLikeImageInput({ mimeType: 'image/jpeg', nameOrUri: 'a.jpg' }),
    ).toBe(false)
  })
})

describe('byte sniffers', () => {
  it('recognizes JPEG and WebP headers', () => {
    expect(looksLikeJpegBytes(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(true)
    expect(looksLikeJpegBytes(Uint8Array.from([0x00, 0x00]))).toBe(false)
    expect(
      looksLikeWebpBytes(
        Uint8Array.from([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe(true)
  })

  it('recognizes HEIC brands from ISO BMFF headers', () => {
    expect(
      looksLikeHeicBytes(
        Uint8Array.from([
          0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69,
          0x63,
        ]),
      ),
    ).toBe(true)
  })
})
