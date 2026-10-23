import { describe, expect, it } from 'vitest'
import {
  aspectOfMedia,
  HERO_ASPECT,
  TILE_ASPECT,
} from '@/features/public-journey/lib/media-aspect'

describe('aspectOfMedia', () => {
  it('crops a panorama instead of making a low strip', () => {
    expect(
      aspectOfMedia(
        { height: 900, width: 3000 },
        HERO_ASPECT.min,
        HERO_ASPECT.max,
      ),
    ).toBeCloseTo(16 / 9)
  })

  it('never makes a hero narrower than 4:3, a tile narrower than 3:4', () => {
    const portrait = { height: 1600, width: 1000 }
    expect(
      aspectOfMedia(portrait, HERO_ASPECT.min, HERO_ASPECT.max),
    ).toBeCloseTo(4 / 3)
    expect(
      aspectOfMedia(portrait, TILE_ASPECT.min, TILE_ASPECT.max),
    ).toBeCloseTo(0.75)
  })

  it('keeps ratios inside the range and defaults to 4:3', () => {
    expect(
      aspectOfMedia({ height: 1000, width: 1500 }, 4 / 3, 16 / 9),
    ).toBeCloseTo(1.5)
    expect(
      aspectOfMedia({ height: null, width: null }, 4 / 3, 16 / 9),
    ).toBeCloseTo(4 / 3)
  })
})
