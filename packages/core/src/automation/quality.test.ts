import { describe, expect, it } from 'vitest'
import {
  dhash,
  hammingDistance,
  laplacianVariance,
  meanLuminance,
  mediaQualitySchema,
  rgbaToGray,
} from './quality.ts'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function gradient(w: number, h: number, flip = false): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const xx = flip ? w - 1 - x : x
      out[y * w + x] = Math.round((xx / (w - 1)) * 255)
    }
  }
  return out
}

describe('dhash', () => {
  it('is deterministic, identical images give distance 0', () => {
    const a = gradient(64, 48)
    expect(dhash(a, 64, 48)).toBe(dhash(a.slice(), 64, 48))
    expect(hammingDistance(dhash(a, 64, 48), dhash(a, 64, 48))).toBe(0)
  })

  it('stays a non-negative integer below 2^49 for random images', () => {
    const rand = rng(42)
    for (let i = 0; i < 200; i += 1) {
      const w = 1 + Math.floor(rand() * 40)
      const h = 1 + Math.floor(rand() * 40)
      const img = Uint8Array.from({ length: w * h }, () =>
        Math.floor(rand() * 256),
      )
      const hash = dhash(img, w, h)
      expect(Number.isSafeInteger(hash)).toBe(true)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThan(2 ** 49)
    }
  })

  it('a horizontally flipped gradient is far away', () => {
    const d = hammingDistance(
      dhash(gradient(64, 48), 64, 48),
      dhash(gradient(64, 48, true), 64, 48),
    )
    expect(d).toBeGreaterThan(40)
  })

  it('handles tiny inputs by clamping', () => {
    expect(dhash([10], 1, 1)).toBe(0)
    expect(Number.isSafeInteger(dhash([1, 9, 3, 4], 2, 2))).toBe(true)
  })

  it('throws RangeError on empty or mismatched input', () => {
    expect(() => dhash([], 0, 0)).toThrow(RangeError)
    expect(() => dhash([1, 2, 3], 2, 2)).toThrow(RangeError)
  })
})

describe('hammingDistance', () => {
  it('counts bits across the 32-bit boundary', () => {
    expect(hammingDistance(0, 0)).toBe(0)
    expect(hammingDistance(0, 2 ** 32)).toBe(1)
    expect(hammingDistance(2 ** 32 - 1, 2 ** 32)).toBe(33)
    expect(hammingDistance(0, 2 ** 49 - 1)).toBe(49)
    expect(hammingDistance(2 ** 48, 1)).toBe(2)
  })

  it('matches a BigInt reference on random values', () => {
    const rand = rng(7)
    const pop = (n: bigint) => n.toString(2).replaceAll('0', '').length
    for (let i = 0; i < 300; i += 1) {
      const a = Math.floor(rand() * 2 ** 49)
      const b = Math.floor(rand() * 2 ** 49)
      expect(hammingDistance(a, b)).toBe(pop(BigInt(a) ^ BigInt(b)))
    }
  })
})

describe('laplacianVariance', () => {
  function pattern(w: number, h: number): Uint8Array {
    return Uint8Array.from({ length: w * h }, (_, i) =>
      (Math.floor((i % w) / 2) + Math.floor(i / w / 2)) % 2 === 0 ? 0 : 255,
    )
  }
  function blur(src: Uint8Array, w: number, h: number): Uint8Array {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let s = 0
        let n = 0
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const xx = x + dx
            const yy = y + dy
            if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
              s += src[yy * w + xx] ?? 0
              n += 1
            }
          }
        }
        out[y * w + x] = Math.round(s / n)
      }
    }
    return out
  }

  it('is lower for a blurred image', () => {
    const sharp = pattern(32, 32)
    expect(laplacianVariance(blur(sharp, 32, 32), 32, 32)).toBeLessThan(
      laplacianVariance(sharp, 32, 32),
    )
  })

  it('is 0 for flat and tiny images', () => {
    expect(laplacianVariance(new Uint8Array(100).fill(9), 10, 10)).toBe(0)
    expect(laplacianVariance([1, 2, 3, 4], 2, 2)).toBe(0)
  })
})

describe('meanLuminance / rgbaToGray', () => {
  it('maps 0..255 to 0..1', () => {
    expect(meanLuminance([0, 0])).toBe(0)
    expect(meanLuminance([255, 255])).toBe(1)
    expect(meanLuminance([0, 255])).toBeCloseTo(0.5)
    expect(meanLuminance([])).toBe(0)
  })

  it('converts RGBA with Rec. 601 weights', () => {
    const gray = rgbaToGray(
      [255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 255, 0],
      3,
      1,
    )
    expect(Array.from(gray)).toEqual([76, 150, 255])
    expect(() => rgbaToGray([1, 2, 3], 1, 1)).toThrow(RangeError)
  })
})

describe('mediaQualitySchema', () => {
  it('accepts valid payloads', () => {
    expect(mediaQualitySchema.safeParse({ sharp: 0, v: 1 }).success).toBe(true)
    expect(
      mediaQualitySchema.safeParse({
        exposure: 0.4,
        eyesClosed: false,
        sharp: 12.5,
        v: 1,
      }).success,
    ).toBe(true)
  })

  it('rejects invalid payloads', () => {
    expect(mediaQualitySchema.safeParse({ sharp: 1, v: 2 }).success).toBe(false)
    expect(mediaQualitySchema.safeParse({ sharp: -1, v: 1 }).success).toBe(
      false,
    )
    expect(
      mediaQualitySchema.safeParse({ exposure: 1.2, sharp: 1, v: 1 }).success,
    ).toBe(false)
    expect(mediaQualitySchema.safeParse({ v: 1 }).success).toBe(false)
    expect(
      mediaQualitySchema.safeParse({ eyesClosed: 'no', sharp: 1, v: 1 })
        .success,
    ).toBe(false)
  })
})
