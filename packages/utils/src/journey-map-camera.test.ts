import { describe, expect, it } from 'vitest'
import { computeJourneyStopMapCamera } from './journey-map-camera.ts'

describe('computeJourneyStopMapCamera', () => {
  it('returns null for an empty point set', () => {
    expect(computeJourneyStopMapCamera([])).toBeNull()
  })

  it('centers on a single stop with a default zoom', () => {
    expect(
      computeJourneyStopMapCamera([{ latitude: 49.2, longitude: 16.6 }]),
    ).toEqual({
      center: { latitude: 49.2, longitude: 16.6 },
      type: 'center',
      zoomLevel: 12,
    })
  })

  it('fits bounds for multiple stops with padding', () => {
    const camera = computeJourneyStopMapCamera([
      { latitude: 49.2, longitude: 16.6 },
      { latitude: 48.1, longitude: 17.2 },
    ])

    expect(camera?.type).toBe('bounds')
    if (camera?.type !== 'bounds') {
      return
    }

    expect(camera.ne[1]).toBeGreaterThan(camera.sw[1])
    expect(camera.padding).toBe(48)
    expect(camera.maxZoomLevel).toBe(14)
  })

  it('handles identical coordinates deterministically', () => {
    const first = computeJourneyStopMapCamera([
      { latitude: 50, longitude: 14 },
      { latitude: 50, longitude: 14 },
    ])
    const second = computeJourneyStopMapCamera([
      { latitude: 50, longitude: 14 },
      { latitude: 50, longitude: 14 },
    ])

    expect(first).toEqual(second)
    expect(first).toEqual({
      center: { latitude: 50, longitude: 14 },
      type: 'center',
      zoomLevel: 12,
    })
  })

  it('handles far-apart stops without collapsing latitude', () => {
    const camera = computeJourneyStopMapCamera([
      { latitude: -33.9, longitude: 18.4 },
      { latitude: 64.1, longitude: -21.9 },
    ])

    expect(camera?.type).toBe('bounds')
    if (camera?.type !== 'bounds') {
      return
    }

    expect(camera.ne[1]).toBeLessThanOrEqual(90)
    expect(camera.sw[1]).toBeGreaterThanOrEqual(-90)
  })

  it('handles antimeridian-crossing stop sets via unwrapped bounds', () => {
    const camera = computeJourneyStopMapCamera([
      { latitude: 10, longitude: 170 },
      { latitude: 12, longitude: -170 },
    ])

    expect(camera?.type).toBe('bounds')
    if (camera?.type !== 'bounds') {
      return
    }

    expect(camera.ne[0]).toBeLessThan(camera.sw[0])
  })

  it('clamps latitude to valid bounds', () => {
    const camera = computeJourneyStopMapCamera([
      { latitude: 89.9, longitude: 0 },
      { latitude: 95, longitude: 1 },
    ])

    expect(camera?.type).toBe('bounds')
    if (camera?.type !== 'bounds') {
      return
    }

    expect(camera.ne[1]).toBeLessThanOrEqual(90)
  })
})
