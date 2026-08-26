import { describe, expect, it } from 'vitest'
import {
  calculateDimensions,
  calculateNormalizedFullDimensions,
} from '@/entities/photo/lib/photo-dimensions'

describe('calculateDimensions', () => {
  it('preserves aspect ratio while reducing longest edge (landscape)', () => {
    expect(calculateDimensions({ height: 3000, width: 4000 }, 1000)).toEqual({
      height: 750,
      width: 1000,
    })
  })

  it('preserves aspect ratio while reducing longest edge (portrait)', () => {
    expect(calculateDimensions({ height: 4000, width: 3000 }, 1000)).toEqual({
      height: 1000,
      width: 750,
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

describe('calculateNormalizedFullDimensions', () => {
  it('caps normal photos at 2560 longest edge', () => {
    expect(
      calculateNormalizedFullDimensions({ height: 3000, width: 4000 }),
    ).toEqual({
      height: 1920,
      width: 2560,
    })
  })
})
