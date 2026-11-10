import { describe, expect, it } from 'vitest'
import { laplacianVariance } from '@/features/media-import/lib/sharpness'

function grey(
  width: number,
  height: number,
  f: (x: number, y: number) => number,
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4
      const v = f(x, y)
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return data
}

describe('laplacianVariance', () => {
  it('is zero for a flat picture and larger for a sharper one', () => {
    const flat = grey(16, 16, () => 128)
    const sharp = grey(16, 16, (x) => (x % 2 === 0 ? 0 : 255))
    const soft = grey(16, 16, (x) => (x % 2 === 0 ? 100 : 155))
    expect(laplacianVariance(flat, 16, 16)).toBe(0)
    expect(laplacianVariance(sharp, 16, 16)).toBeGreaterThan(
      laplacianVariance(soft, 16, 16),
    )
  })
  it('handles tiny images', () => {
    expect(laplacianVariance(new Uint8ClampedArray(16), 2, 2)).toBe(0)
  })
})
