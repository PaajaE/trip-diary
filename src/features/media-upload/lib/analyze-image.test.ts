import { describe, expect, it } from 'vitest'
import {
  analysisSize,
  analyzeImageData,
  type ImageDataLike,
} from '@/features/media-upload/lib/analyze-image'

function raster(
  w: number,
  h: number,
  value: (x: number, y: number) => number,
): ImageDataLike {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = value(x, y)
      const i = (y * w + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, height: h, width: w }
}

const checker = raster(64, 48, (x, y) => ((x + y) % 2 === 0 ? 255 : 0))
const gradient = raster(64, 48, (x) => Math.round((x / 63) * 255))
const flat = raster(64, 48, () => 128)

describe('analyzeImageData', () => {
  it('flat gray has zero sharpness and mid exposure', () => {
    const result = analyzeImageData(flat)
    expect(result?.quality.sharp).toBe(0)
    expect(result?.quality.exposure).toBeCloseTo(0.502, 3)
  })

  it('checkerboard is sharper than a gradient', () => {
    const sharp = analyzeImageData(checker)?.quality.sharp ?? -1
    const smooth = analyzeImageData(gradient)?.quality.sharp ?? -1
    expect(sharp).toBeGreaterThan(smooth)
  })

  it('identical images give identical hashes', () => {
    expect(analyzeImageData(gradient)?.phash).toBe(
      analyzeImageData(raster(64, 48, (x) => Math.round((x / 63) * 255)))
        ?.phash,
    )
  })

  it('rounds sharp to 2 and exposure to 3 decimals', () => {
    const q = analyzeImageData(checker)?.quality
    expect(q?.sharp).toBe(Math.round((q?.sharp ?? 0) * 100) / 100)
    expect(q?.exposure).toBe(Math.round((q?.exposure ?? 0) * 1000) / 1000)
  })

  it('returns null instead of throwing on bad input', () => {
    expect(analyzeImageData({ data: [], height: 0, width: 0 })).toBeNull()
  })
})

describe('analysisSize', () => {
  it('scales the longest side to 256 and keeps aspect', () => {
    expect(analysisSize({ height: 3000, width: 4000 })).toEqual({
      height: 192,
      width: 256,
    })
    expect(analysisSize({ height: 4000, width: 1000 })).toEqual({
      height: 256,
      width: 64,
    })
  })

  it('never upscales and never returns zero', () => {
    expect(analysisSize({ height: 50, width: 100 })).toEqual({
      height: 50,
      width: 100,
    })
    expect(analysisSize({ height: 1, width: 10000 }).height).toBe(1)
  })
})
