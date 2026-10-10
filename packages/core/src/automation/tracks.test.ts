import { describe, expect, it } from 'vitest'
import { canadaV1Media } from './fixtures/canada-v1.ts'
import {
  deriveTrackFromMedia,
  parseGpxTrackPoints,
  simplifyTrack,
  summarizeTrack,
} from './tracks.ts'

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>Magog</name><trkseg>
    <trkpt lat="50.8600" lon="-115.4200"><ele>1770</ele></trkpt>
    <trkpt lat="50.8500" lon="-115.4550"><ele>1810</ele></trkpt>
    <trkpt lat="50.8400" lon="-115.4900"><ele>1780</ele></trkpt>
    <trkpt lat="50.8600" lon="-115.5700"><ele>2160</ele></trkpt>
    <trkpt lat="50.8750" lon="-115.6460"><ele>2150</ele></trkpt>
    <trkpt lat="91" lon="0"/>
  </trkseg></trk>
</gpx>`

describe('parseGpxTrackPoints', () => {
  it('reads points with elevation and skips invalid ones', () => {
    const points = parseGpxTrackPoints(GPX)

    expect(points).toHaveLength(5)
    expect(points[0]).toEqual({
      elevation: 1770,
      latitude: 50.86,
      longitude: -115.42,
    })
  })

  it('returns nothing for a document without a track', () => {
    expect(parseGpxTrackPoints('<gpx></gpx>')).toEqual([])
  })
})

describe('summarizeTrack', () => {
  it('measures distance and climb on the full track', () => {
    const summary = summarizeTrack(parseGpxTrackPoints(GPX))

    expect(summary?.distanceM).toBeGreaterThan(17_000)
    expect(summary?.distanceM).toBeLessThan(20_000)
    // +40 +380 (descents ignored)
    expect(summary?.ascentM).toBe(420)
    expect(summary?.geojson.type).toBe('LineString')
    expect(summary?.geojson.coordinates[0]).toEqual([-115.42, 50.86, 1770])
  })

  it('reports no climb when elevations are missing', () => {
    expect(
      summarizeTrack([
        { latitude: 51, longitude: -115 },
        { latitude: 51.01, longitude: -115 },
      ])?.ascentM,
    ).toBeNull()
  })

  it('needs at least two points', () => {
    expect(summarizeTrack([{ latitude: 51, longitude: -115 }])).toBeNull()
  })
})

describe('simplifyTrack', () => {
  it('drops points that barely bend the line', () => {
    const straight = Array.from({ length: 50 }, (_, index) => ({
      latitude: 51 + index * 0.001,
      longitude: -115 + (index % 2) * 0.00001, // ~0.7 m wiggle
    }))

    expect(simplifyTrack(straight, 25)).toHaveLength(2)
  })

  it('keeps real turns', () => {
    const corner = [
      { latitude: 51, longitude: -115 },
      { latitude: 51.01, longitude: -115 },
      { latitude: 51.01, longitude: -114.98 },
    ]

    expect(simplifyTrack(corner, 25)).toEqual(corner)
  })
})

describe('deriveTrackFromMedia', () => {
  it('builds a rough route from located photos in time order', () => {
    const calgaryAfternoon = canadaV1Media.filter((media) =>
      ['p19', 'p20', 'p21', 'p22', 'p23', 'p24'].includes(media.id),
    )
    const summary = deriveTrackFromMedia([...calgaryAfternoon].reverse())

    expect(summary?.geojson.coordinates.length).toBeGreaterThanOrEqual(2)
    expect(summary?.distanceM).toBeGreaterThan(1000)
    expect(summary?.ascentM).toBeNull()
  })
})
