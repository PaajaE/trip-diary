import { describe, expect, it } from 'vitest'
import type { MediaPoint } from './media-point.ts'
import { detectStops } from './stays.ts'

const MIN = 60_000
const START = Date.UTC(2026, 5, 12, 8, 0, 0)
const M_PER_DEG = 111_320

let counter = 0
function photo(
  minute: number,
  east: number,
  north: number,
  extra: Partial<MediaPoint> = {},
): MediaPoint {
  counter += 1
  return {
    capturedAt: new Date(START + minute * MIN).toISOString(),
    id: `p${String(counter).padStart(4, '0')}`,
    latitude: 50 + north / M_PER_DEG,
    longitude: 14 + east / (M_PER_DEG * Math.cos((50 * Math.PI) / 180)),
    ownerId: 'anna',
    ...extra,
  }
}

function stay(
  count: number,
  spacing: number,
  from: number,
  east: number,
  north = 0,
): MediaPoint[] {
  return Array.from({ length: count }, (_, index) =>
    photo(from + index * spacing, east + (index % 3) * 5, north),
  )
}

describe('detectStops', () => {
  it('gives a lone photo a point stop with a reason and no interval', () => {
    const lone = photo(0, 0, 0)
    const { stops } = detectStops([lone])
    expect(stops).toHaveLength(1)
    expect(stops[0]).toMatchObject({
      anchorMediaId: lone.id,
      kind: 'point',
      mediaIds: [lone.id],
    })
    expect(stops[0]?.startsAt).toBe(stops[0]?.endsAt)
    expect(stops[0]?.reasons.length).toBeGreaterThan(0)
    expect(stops[0]?.confidence).toBeGreaterThan(0)
    expect(stops[0]?.confidence).toBeLessThanOrEqual(1)
  })

  it('handles a dense morning and a sparse afternoon in one timeline', () => {
    const morning = stay(10, 1, 0, 0)
    // Sparse afternoon: a photo every 40 min, 1.2 km apart, then a pair.
    const afternoon = [0, 1, 2, 3].map((index) =>
      photo(240 + index * 40, 3000 + index * 1200, 0),
    )
    const stops = detectStops([...morning, ...afternoon]).stops
    expect(stops).toHaveLength(5)
    expect(stops[0]?.kind).toBe('stay')
    expect(stops[0]?.mediaIds).toHaveLength(10)
    expect(stops.slice(1).every((stop) => stop.kind === 'point')).toBe(true)
  })

  it('does not depend on the input order', () => {
    const media = [...stay(8, 2, 0, 0), ...stay(5, 3, 90, 2000)]
    const forward = detectStops(media).stops
    const backward = detectStops([...media].reverse()).stops
    expect(backward).toEqual(forward)
  })

  it('keeps parallel stops of two authors far apart, merges close ones', () => {
    const anna = stay(6, 3, 0, 0)
    const far = stay(6, 3, 1, 20_000).map((p) => ({ ...p, ownerId: 'bob' }))
    expect(detectStops([...anna, ...far]).stops).toHaveLength(2)
    const near = stay(6, 3, 1, 300).map((p) => ({ ...p, ownerId: 'bob' }))
    const merged = detectStops([...anna, ...near]).stops
    expect(merged).toHaveLength(1)
    expect(merged[0]?.ownerIds).toEqual(['anna', 'bob'])
  })

  it('attaches a clock-shifted copy to the stop of its original', () => {
    const originals = stay(6, 2, 0, 0).map((p) => ({
      ...p,
      capturedTz: 'Europe/Prague',
    }))
    const source = originals[2]
    expect(source).toBeDefined()
    const copy: MediaPoint = {
      ...(source as MediaPoint),
      capturedAt: new Date(START + 4 * MIN + 3 * 3_600_000).toISOString(),
      capturedTz: null,
      id: 'copy-1',
    }
    const result = detectStops([...originals, copy])
    expect(result.stops).toHaveLength(1)
    expect(result.stops[0]?.mediaIds).toContain('copy-1')
    expect(result.stops[0]?.probableDuplicateIds).toEqual(['copy-1'])
    expect(result.stops[0]?.anchorMediaId).toBe(originals[0]?.id)
    expect(result.clockShiftProposals).toHaveLength(1)
    expect(result.clockShiftProposals[0]).toMatchObject({
      kind: 'duplicate-copy',
      mediaIds: ['copy-1'],
      offsetSeconds: -3 * 3600,
    })
  })

  it('lists undated media and leaves locked ones out', () => {
    const dated = stay(3, 1, 0, 0)
    const undated: MediaPoint = { ...photo(0, 0, 0), capturedAt: null }
    const locked = photo(5, 0, 0)
    const result = detectStops([...dated, undated, locked], {
      lockedMediaIds: new Set([locked.id]),
    })
    expect(result.undatedMediaIds).toEqual([undated.id])
    expect(result.stops.flatMap((stop) => stop.mediaIds)).not.toContain(
      locked.id,
    )
  })

  it('uses the duration of a video for the end of the stop', () => {
    const before = stay(3, 1, 0, 0)
    const video = photo(5, 0, 0, { durationMs: 20 * MIN, kind: 'video' })
    const [stop] = detectStops([...before, video]).stops
    expect(stop?.endsAt).toBe(new Date(START + 25 * MIN).toISOString())
  })

  it('reports derived positions of photos without GPS', () => {
    const withGps = stay(6, 2, 0, 0)
    const camera = photo(5, 0, 0, {
      device: 'camera',
      latitude: null,
      longitude: null,
    })
    const [stop] = detectStops([...withGps, camera]).stops
    expect(stop?.mediaIds).toContain(camera.id)
    expect(stop?.derivedLocationCount).toBe(1)
  })
})
