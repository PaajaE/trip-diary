import { describe, expect, it } from 'vitest'
import {
  isPanoramaDimensions,
  NORMAL_MAX_LONGEST_EDGE,
  PANORAMA_MAX_LONGEST_EDGE,
  PANORAMA_MAX_PIXELS,
  resolveNormalizedDimensions,
  resolveThumbDimensions,
  THUMB_MAX_LONGEST_EDGE,
} from './normalize-dimensions'

describe('resolveNormalizedDimensions', () => {
  it('normalizes ordinary camera JPEG dimensions even when already JPEG-sized', () => {
    const result = resolveNormalizedDimensions({ height: 3024, width: 4032 })
    expect(result.isPanorama).toBe(false)
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(
      NORMAL_MAX_LONGEST_EDGE,
    )
    expect(result.width).toBe(2560)
    expect(result.height).toBe(1920)
  })

  it('does not leave large JPEGs at full camera resolution', () => {
    const result = resolveNormalizedDimensions({ height: 4000, width: 6000 })
    expect(Math.max(result.width, result.height)).toBe(NORMAL_MAX_LONGEST_EDGE)
    expect(result.width * result.height).toBeLessThanOrEqual(8_000_000)
  })

  it('allows panoramas a higher longest edge while respecting pixel budget', () => {
    const result = resolveNormalizedDimensions({ height: 3936, width: 7630 })
    expect(result.isPanorama).toBe(true)
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(
      PANORAMA_MAX_LONGEST_EDGE,
    )
    expect(result.width * result.height).toBeLessThanOrEqual(
      PANORAMA_MAX_PIXELS,
    )
    // Must remain meaningfully wide — not crushed to a normal-photo width.
    expect(result.width).toBeGreaterThan(NORMAL_MAX_LONGEST_EDGE)
  })

  it('does not upscale small images', () => {
    expect(resolveNormalizedDimensions({ height: 480, width: 640 })).toEqual(
      expect.objectContaining({ height: 480, width: 640, isPanorama: false }),
    )
  })
})

describe('isPanoramaDimensions', () => {
  it('detects ultra-wide aspect ratios', () => {
    expect(isPanoramaDimensions(7630, 3936)).toBe(true)
    expect(isPanoramaDimensions(4032, 3024)).toBe(false)
  })
})

describe('resolveThumbDimensions', () => {
  it('caps longest edge for gallery thumbs', () => {
    const thumb = resolveThumbDimensions({ height: 1920, width: 2560 })
    expect(Math.max(thumb.width, thumb.height)).toBe(THUMB_MAX_LONGEST_EDGE)
  })
})
