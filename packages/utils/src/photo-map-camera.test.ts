import { describe, expect, it } from 'vitest'
import {
  collectValidPhotoMapPoints,
  computePhotoMapCamera,
  isValidPhotoMapCoordinate,
} from './photo-map-camera.ts'

describe('isValidPhotoMapCoordinate', () => {
  it('accepts finite in-range coordinates', () => {
    expect(isValidPhotoMapCoordinate(49.2, 16.6)).toBe(true)
  })

  it('rejects null, NaN, and out-of-range values', () => {
    expect(isValidPhotoMapCoordinate(null, 16.6)).toBe(false)
    expect(isValidPhotoMapCoordinate(49.2, Number.NaN)).toBe(false)
    expect(isValidPhotoMapCoordinate(120, 16.6)).toBe(false)
    expect(isValidPhotoMapCoordinate(49.2, 200)).toBe(false)
  })

  it('rejects Null Island by default and allows it when requested', () => {
    expect(isValidPhotoMapCoordinate(0, 0)).toBe(false)
    expect(isValidPhotoMapCoordinate(0, 0, { allowNullIsland: true })).toBe(
      true,
    )
  })
})

describe('collectValidPhotoMapPoints', () => {
  it('keeps one valid point and drops invalid ones', () => {
    expect(
      collectValidPhotoMapPoints([
        { id: 'a', latitude: null, longitude: null },
        { id: 'b', latitude: 49.2, longitude: 16.6 },
        { id: 'c', latitude: 0, longitude: 0 },
      ]),
    ).toEqual([{ id: 'b', latitude: 49.2, longitude: 16.6 }])
  })

  it('keeps duplicate coordinates as separate photos', () => {
    expect(
      collectValidPhotoMapPoints([
        { id: 'a', latitude: 49.2, longitude: 16.6 },
        { id: 'b', latitude: 49.2, longitude: 16.6 },
      ]),
    ).toHaveLength(2)
  })
})

describe('computePhotoMapCamera', () => {
  it('returns null when no valid coordinates exist', () => {
    expect(
      computePhotoMapCamera([
        { latitude: null, longitude: null },
        { latitude: 0, longitude: 0 },
      ]),
    ).toBeNull()
  })

  it('uses a useful fixed zoom for a single point', () => {
    expect(
      computePhotoMapCamera([{ latitude: 49.1951, longitude: 16.6068 }]),
    ).toEqual({
      center: { latitude: 49.1951, longitude: 16.6068 },
      type: 'center',
      zoomLevel: 12,
    })
  })

  it('builds bounds from every geotagged photo, not only endpoints', () => {
    const camera = computePhotoMapCamera([
      { latitude: 50, longitude: 14 },
      { latitude: 51, longitude: 15 },
      { latitude: 49, longitude: 13 },
    ])
    expect(camera?.type).toBe('bounds')
    if (camera?.type !== 'bounds') {
      return
    }
    expect(camera.sw[1]).toBeLessThan(49)
    expect(camera.ne[1]).toBeGreaterThan(51)
    expect(camera.sw[0]).toBeLessThan(13)
    expect(camera.ne[0]).toBeGreaterThan(15)
  })

  it('does not zoom out to the world for antimeridian-adjacent points', () => {
    const camera = computePhotoMapCamera([
      { latitude: 10, longitude: 170 },
      { latitude: 12, longitude: -170 },
    ])
    expect(camera?.type).toBe('bounds')
    if (camera?.type !== 'bounds') {
      return
    }
    // Unwrapped span should stay near 20°, not ~340°.
    const span = Math.abs(camera.ne[0] - camera.sw[0])
    const wrappedSpan = span > 180 ? 360 - span : span
    expect(wrappedSpan).toBeLessThan(40)
  })

  it('fits widely separated points without collapsing', () => {
    const camera = computePhotoMapCamera([
      { latitude: 48.85, longitude: 2.35 },
      { latitude: 51.05, longitude: -114.07 },
    ])
    expect(camera?.type).toBe('bounds')
  })
})
