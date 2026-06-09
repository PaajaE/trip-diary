import { describe, expect, it } from 'vitest'
import { calculateDimensions } from '@/entities/photo/lib/photo-dimensions'

describe('calculateDimensions', () => {
  it('preserves aspect ratio while reducing width', () => {
    expect(calculateDimensions({ height: 3000, width: 4000 }, 1000)).toEqual({
      height: 750,
      width: 1000,
    })
  })

  it('does not upscale small images', () => {
    const source = Object.create(
      {},
      {
        height: { value: 300 },
        width: { value: 400 },
      },
    ) as { height: number; width: number }

    expect(calculateDimensions(source, 1000)).toEqual({
      height: 300,
      width: 400,
    })
  })
})
