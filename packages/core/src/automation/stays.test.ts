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

  it('collapses photos taken from a car into one en route stop', () => {
    counter = 0
    const before = stay(4, 1, 0, 0)
    // 60 km in 40 min with two window photos, then a stay
    const window = [photo(20, 22_500, 0), photo(35, 52_500, 0)]
    const after = stay(4, 1, 45, 60_000)
    const result = detectStops([...before, ...window, ...after])
    expect(result.stops.map((stop) => stop.kind)).toEqual([
      'stay',
      'en_route',
      'stay',
    ])
    const route = result.stops[1]
    expect(route?.mediaIds).toEqual(window.map((item) => item.id))
    expect(route?.collapsed).toHaveLength(2)
    expect(route?.movement).toBe('vehicle')
    expect(route?.reasons[0]).toMatch(/^en route/)
    expect(result.transits.some((t) => t.mode === 'vehicle')).toBe(true)
  })

  it('keeps a photo at a known place or where the speed drops a point', () => {
    counter = 0
    const before = stay(4, 1, 0, 0)
    const sight = photo(20, 22_500, 0, { placeKind: 'attraction' })
    const slow = photo(35, 52_500, 0)
    const after = stay(4, 1, 45, 60_000)
    const stops = detectStops([...before, sight, slow, ...after]).stops
    const ofSight = stops.find((stop) => stop.mediaIds.includes(sight.id))
    expect(ofSight?.kind).toBe('point')
    expect(ofSight?.mediaIds).toEqual([sight.id])
  })

  it('never collapses a lone ambiguous photo (27 km/h) between stays', () => {
    counter = 0
    const before = stay(3, 1, 0, 0)
    const lone = photo(12, 4500, 0)
    const after = stay(3, 1, 24, 9000)
    const kinds = detectStops([...before, lone, ...after]).stops.map(
      (stop) => stop.kind,
    )
    expect(kinds).toEqual(['stay', 'point', 'stay'])
  })

  it('does not merge a car at 100 km/h or distinct sights into one walk', () => {
    counter = 0
    // 6 photos 2 min apart, 3.3 km apart: 100 km/h, no anchor, dense
    const car = Array.from({ length: 6 }, (_, i) => photo(i * 2, i * 3300, 0))
    const stops = detectStops(car).stops
    expect(
      stops.every(
        (stop) => stop.kind !== 'en_route' || stop.movement !== 'walk',
      ),
    ).toBe(true)
  })

  it('finds a trek and an urban walk inside a day', () => {
    counter = 0
    const trek = Array.from({ length: 12 }, (_, i) =>
      photo(i * 12, i * 800, (i % 2) * 150),
    )
    const result = detectStops(trek)
    expect(result.dayTrips).toHaveLength(1)
    expect(result.dayTrips[0]?.tripType).toBe('trek')
    expect(result.dayTrips[0]?.reason).toMatch(/trip/)
    expect(result.stops).toHaveLength(1)
    expect(result.stops[0]?.kind).toBe('en_route')
    counter = 0
    const city = Array.from({ length: 10 }, (_, i) =>
      photo(i * 14, i * 500, 0, { placeKind: 'settlement' }),
    )
    expect(detectStops(city).dayTrips[0]?.tripType).toBe('walk')
  })

  it('does not make a trip below 90 min or 3 km', () => {
    counter = 0
    const short = Array.from({ length: 8 }, (_, i) => photo(i * 10, i * 400, 0))
    expect(detectStops(short).dayTrips).toEqual([])
    counter = 0
    const slow = Array.from({ length: 8 }, (_, i) => photo(i * 15, i * 150, 0))
    expect(detectStops(slow).dayTrips).toEqual([])
  })

  it('merges two authors in one car and shares the trip', () => {
    counter = 0
    const before = stay(4, 1, 0, 0)
    const after = stay(4, 1, 45, 60_000)
    const anna = [photo(20, 22_500, 0), photo(35, 52_500, 0)]
    const bob = [
      ...stay(4, 1, 0, 0).map((item) => ({ ...item, ownerId: 'bob' })),
      photo(21, 23_500, 0, { ownerId: 'bob' }),
      photo(36, 53_500, 0, { ownerId: 'bob' }),
      ...stay(4, 1, 45, 60_000).map((item) => ({ ...item, ownerId: 'bob' })),
    ]
    const stops = detectStops([...before, ...anna, ...bob, ...after]).stops
    const routes = stops.filter((stop) => stop.kind === 'en_route')
    expect(routes).toHaveLength(1)
    expect(routes[0]?.ownerIds).toEqual(['anna', 'bob'])
  })

  it('does not chain two far visits through one visit between them', () => {
    counter = 0
    const p1 = stay(3, 1, 0, 0)
    const p2 = stay(3, 1, 0, 700)
    const middle = Array.from({ length: 3 }, (_, i) =>
      photo(i, 350 + i * 3, 0, { ownerId: 'bob' }),
    )
    const stops = detectStops([...p1, ...p2, ...middle]).stops
    // one author never has two visits in the same group
    for (const stop of stops) {
      expect(stop.ownerIds.length).toBeLessThanOrEqual(2)
    }
    expect(stops.length).toBeGreaterThanOrEqual(2)
  })

  it('handles equal capture seconds and two devices of one author', () => {
    counter = 0
    const burst = Array.from({ length: 40 }, (_, i) =>
      photo(0, (i % 4) * 3, 0, { device: i % 2 === 0 ? 'phone' : 'camera' }),
    )
    const result = detectStops(burst)
    expect(result.stops).toHaveLength(1)
    expect(result.stops[0]?.mediaIds).toHaveLength(40)
    expect(result.stops[0]?.instant).toBe(false)
  })

  it('keeps a stay across the antimeridian in one place', () => {
    counter = 0
    const fiji = Array.from({ length: 6 }, (_, i) =>
      photo(i, 0, 0, {
        latitude: -17,
        longitude: i % 2 === 0 ? 179.9992 : -179.9992,
      }),
    )
    const [stop] = detectStops(fiji).stops
    expect(stop?.mediaIds).toHaveLength(6)
    expect(
      Math.abs(Math.abs(stop?.position?.longitude ?? 0) - 180),
    ).toBeLessThan(0.01)
  })

  it('flags a stop built on a clock-shift hypothesis for review', () => {
    counter = 0
    const phone = Array.from({ length: 8 }, (_, i) =>
      photo(i * 2, 0, 0, { device: 'phone' }),
    )
    const camera = Array.from({ length: 8 }, (_, i) =>
      photo(i * 2 + 1 - 180, 0, 0, {
        device: 'camera',
        latitude: null,
        longitude: null,
      }),
    )
    const plain = detectStops([...phone, ...camera])
    expect(plain.stops.every((stop) => !stop.needsReview)).toBe(true)
    expect(plain.clockShiftProposals).toHaveLength(1)
    const guess = detectStops([...phone, ...camera], {
      applyProposedClockShifts: true,
    })
    expect(guess.stops).toHaveLength(1)
    expect(guess.stops[0]?.needsReview).toBe(true)
    expect(guess.stops[0]?.reasons.join(' ')).toMatch(/review/)
  })

  it('keeps every clip of an explicit Live Photo chain', () => {
    counter = 0
    const still = photo(0, 0, 0)
    const clip = photo(0, 0, 0, { kind: 'video', livePhotoOf: still.id })
    const clipOfClip = photo(0, 0, 0, { kind: 'video', livePhotoOf: clip.id })
    const result = detectStops([clipOfClip, clip, still])
    expect(result.stops).toHaveLength(1)
    expect(result.stops[0]?.mediaIds).toHaveLength(3)
    // a cycle has no still: nothing is dropped
    const a = photo(1, 0, 0, { kind: 'video' })
    const b = photo(1, 0, 0, { kind: 'video' })
    const cycle = detectStops([
      { ...a, livePhotoOf: b.id },
      { ...b, livePhotoOf: a.id },
    ])
    expect(cycle.stops.flatMap((stop) => stop.mediaIds).sort()).toEqual(
      [a.id, b.id].sort(),
    )
  })

  it('does not crash on invalid durations and positions', () => {
    counter = 0
    const result = detectStops([
      photo(0, 0, 0, { durationMs: Number.NaN, kind: 'video' }),
      photo(1, 0, 0, { latitude: Number.NaN }),
      photo(2, 0, 0, { latitude: 0, longitude: 0 }),
    ])
    expect(result.stops.flatMap((stop) => stop.mediaIds)).toHaveLength(3)
  })
})
