import { describe, expect, it } from 'vitest'
import type { MediaPoint } from './media-point.ts'
import { medianPoint, prepareMedia } from './prepare.ts'

const MIN = 60_000
const HOUR = 3_600_000
const START = Date.UTC(2026, 5, 12, 8, 0, 0)

function media(
  id: string,
  minute: number,
  north: number,
  extra: Partial<MediaPoint> = {},
): MediaPoint {
  return {
    capturedAt: new Date(START + minute * MIN).toISOString(),
    id,
    latitude: 50 + north / 111_320,
    longitude: 14,
    ownerId: 'anna',
    ...extra,
  }
}

describe('prepareMedia', () => {
  it('drops a far GPS fix but keeps its time, then derives a position', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      media(`a${String(i).padStart(2, '0')}`, i, i % 3),
    )
    items[6] = media('a06', 6, 25_000)
    const result = prepareMedia(items)
    expect(result.outlierMediaIds).toEqual(['a06'])
    const bad = result.points.find((p) => p.id === 'a06')
    expect(bad?.outlier).toBe(true)
    expect(bad?.time).toBe(START + 6 * MIN)
    expect(bad?.locationSource).toBe('same-stream')
    expect(bad?.confidence).toBeGreaterThanOrEqual(0.5)
    expect(bad?.confidence).toBeLessThan(1)
  })

  it('keeps a photo taken on the way between two places', () => {
    const items = [
      media('a1', 0, 0),
      media('a2', 1, 0),
      media('a3', 2, 0),
      media('a4', 20, 20_000),
      media('a5', 40, 40_000),
      media('a6', 41, 40_000),
      media('a7', 42, 40_000),
    ]
    expect(prepareMedia(items).outlierMediaIds).toEqual([])
  })

  it('fills positions from the other device of the same author only', () => {
    const phone = [0, 2, 4, 6, 8, 10].map((m) =>
      media(`ph${String(m)}`, m, 0, { device: 'phone' }),
    )
    const camera = media('cam', 5, 0, {
      device: 'camera',
      latitude: null,
      longitude: null,
    })
    const other = media('cam-bob', 5, 0, {
      device: 'camera',
      latitude: null,
      longitude: null,
      ownerId: 'bob',
    })
    const result = prepareMedia([...phone, camera, other])
    expect(result.points.find((p) => p.id === 'cam')?.locationSource).toBe(
      'cross-stream',
    )
    expect(result.points.find((p) => p.id === 'cam-bob')?.location).toBeNull()
  })

  it('proposes a whole-hour camera shift and uses it only as a hypothesis', () => {
    const phone = Array.from({ length: 8 }, (_, i) =>
      media(`ph${String(i)}`, i * 2, 0, { device: 'phone' }),
    )
    const camera = Array.from({ length: 8 }, (_, i) =>
      media(`cam${String(i)}`, i * 2 + 1 - 180, 0, {
        device: 'camera',
        latitude: null,
        longitude: null,
      }),
    )
    const result = prepareMedia([...phone, ...camera])
    expect(result.clockShiftProposals).toHaveLength(1)
    expect(result.clockShiftProposals[0]).toMatchObject({
      deviceId: 'camera',
      kind: 'stream-offset',
      offsetSeconds: 3 * 3600,
    })
    // Default: a proposal only, the data is not touched.
    const first = result.points.find((p) => p.id === 'cam0')
    expect(first?.time).toBe(START + (1 - 180) * MIN)
    expect(first?.shiftMs).toBe(0)
    expect(first?.workTime).toBe(first?.time)
    // Opt-in hypothesis: the shift is applied and visible on the point.
    const hypothesis = prepareMedia([...phone, ...camera], {
      applyProposedClockShifts: true,
    })
    const shifted = hypothesis.points.find((p) => p.id === 'cam0')
    expect(shifted?.shiftMs).toBe(3 * HOUR)
    expect(shifted?.workTime).toBe((shifted?.time ?? 0) + 3 * HOUR)
  })

  it('rejects a clock shift when the camera GPS fixes disagree with the phone', () => {
    const phone = Array.from({ length: 8 }, (_, i) =>
      media(`ph${String(i)}`, i * 2, 0, { device: 'phone' }),
    )
    const camera = Array.from({ length: 8 }, (_, i) =>
      i % 2 === 0
        ? media(`cam${String(i)}`, i * 2 + 1 - 180, 30_000, {
            device: 'camera',
          })
        : media(`cam${String(i)}`, i * 2 + 1 - 180, 0, {
            device: 'camera',
            latitude: null,
            longitude: null,
          }),
    )
    // Half of the camera has GPS (> 20 %): never a candidate; with one fix
    // 30 km from the phone the proposal must not stand either.
    const sparse = camera.map((item, i) =>
      i === 0 ? item : { ...item, latitude: null, longitude: null },
    )
    expect(prepareMedia([...phone, ...sparse]).clockShiftProposals).toEqual([])
  })

  it('does not pool media without an author into one person', () => {
    const a = media('a1', 0, 0, { device: 'phone-a', ownerId: null })
    const b = media('b1', 0, 0, { device: 'phone-b', ownerId: '' })
    const result = prepareMedia([a, b])
    expect(new Set(result.points.map((p) => p.ownerId)).size).toBe(2)
  })

  it('treats NaN, out of range and (0, 0) coordinates as no position', () => {
    const bad = [
      media('n1', 0, 0, { latitude: Number.NaN }),
      media('n2', 1, 0, { latitude: 95 }),
      media('n3', 2, 0, { longitude: -181 }),
      media('n4', 3, 0, { latitude: 0, longitude: 0 }),
      media('n5', 4, 0, { latitude: Number.POSITIVE_INFINITY }),
    ]
    const result = prepareMedia(bad)
    expect(result.points.every((p) => p.location === null)).toBe(true)
  })

  it('survives NaN and Infinity video durations', () => {
    const result = prepareMedia([
      media('v1', 0, 0, { durationMs: Number.NaN, kind: 'video' }),
      media('v2', 1, 0, {
        durationMs: Number.POSITIVE_INFINITY,
        kind: 'video',
      }),
      media('v3', 2, 0, { durationMs: -5, kind: 'video' }),
    ])
    for (const point of result.points) {
      expect(Number.isFinite(point.workEnd)).toBe(true)
      expect(point.workEnd).toBeGreaterThanOrEqual(point.workTime)
    }
  })

  it('treats a capture time without an offset as unknown', () => {
    const result = prepareMedia([
      media('t1', 0, 0, { capturedAt: '2026-06-12T08:00:00' }),
      media('t2', 1, 0),
    ])
    expect(result.undatedMediaIds).toEqual(['t1'])
  })

  it('interpolates and takes the median across the antimeridian', () => {
    const fiji = (id: string, minute: number, longitude: number) =>
      media(id, minute, 0, { latitude: -17, longitude })
    const items = [
      fiji('f1', 0, 179.9995),
      fiji('f2', 10, -179.9995),
      { ...fiji('f3', 5, 0), latitude: null, longitude: null },
    ]
    const filled = prepareMedia(items).points.find((p) => p.id === 'f3')
    const longitude = filled?.location?.longitude ?? 0
    expect(Math.abs(Math.abs(longitude) - 180)).toBeLessThan(0.01)
    const chukotka = [
      media('c1', 0, 0, { latitude: 66, longitude: 179.99 }),
      media('c2', 1, 0, { latitude: 66, longitude: -179.99 }),
      media('c3', 2, 0, { latitude: 66, longitude: 179.995 }),
    ]
    const median = medianPoint(
      chukotka.flatMap((item) =>
        item.latitude === null || item.longitude === null
          ? []
          : [{ latitude: item.latitude, longitude: item.longitude }],
      ),
    )
    expect(Math.abs(Math.abs(median?.longitude ?? 0) - 180)).toBeLessThan(0.02)
  })

  it('finds duplicates across the antimeridian', () => {
    const original = media('o1', 0, 0, {
      capturedTz: 'Pacific/Fiji',
      latitude: -17,
      longitude: 179.99999,
    })
    const copy = media('c1', 120, 0, {
      capturedTz: null,
      latitude: -17,
      longitude: 179.99999,
    })
    expect(prepareMedia([original, copy]).duplicates).toHaveLength(1)
  })

  it('does not absorb a re-shot of another device or beyond the cap', () => {
    const original = media('o1', 0, 0, {
      capturedTz: 'Europe/Prague',
      device: 'phone',
    })
    const otherDevice = media('c1', 60, 0, {
      capturedTz: null,
      device: 'camera',
    })
    expect(prepareMedia([original, otherDevice]).duplicates).toEqual([])
    const copies = [1, 2, 3, 4, 5].map((hours) =>
      media(`c${String(hours)}`, hours * 60, 0, {
        capturedTz: null,
        device: 'phone',
      }),
    )
    expect(prepareMedia([original, ...copies]).duplicates).toHaveLength(3)
  })

  it('falls back to the nearest anchor when interpolation is rejected', () => {
    const items = [
      media('a1', 0, 0),
      media('a2', 1, 0),
      media('a3', 2, 0),
      media('x', 3, 0, { latitude: null, longitude: null }),
      media('b1', 55, 4000),
      media('b2', 56, 4000),
    ]
    const x = prepareMedia(items).points.find((p) => p.id === 'x')
    expect(x?.location).not.toBeNull()
    expect(x?.location?.latitude).toBeCloseTo(50, 3)
  })

  it('keeps explicit Live Photo chains (clip of a clip) resolvable', () => {
    const items = [
      media('s1', 0, 0),
      media('s2', 0, 0, { kind: 'video', livePhotoOf: 's1' }),
      media('s3', 0, 0, { kind: 'video', livePhotoOf: 's2' }),
    ]
    expect(prepareMedia(items).points).toHaveLength(3)
  })

  it('does not propose a shift for a camera 40 min behind (not whole hours)', () => {
    const phone = Array.from({ length: 6 }, (_, i) =>
      media(`ph${String(i)}`, i * 2, 0, { device: 'phone' }),
    )
    const camera = Array.from({ length: 6 }, (_, i) =>
      media(`cam${String(i)}`, 50 + i * 2, 0, {
        device: 'camera',
        latitude: null,
        longitude: null,
      }),
    )
    expect(prepareMedia([...phone, ...camera]).clockShiftProposals).toEqual([])
  })

  it('flags copies with null time zone, same coordinates, whole hours off', () => {
    const original = media('o1', 0, 0, { capturedTz: 'Europe/Prague' })
    const copy = media('c1', 120, 0, { capturedTz: null })
    const near = media('n1', 120, 20, { capturedTz: null })
    const halfHour = media('h1', 30, 0, { capturedTz: null })
    const result = prepareMedia([original, copy, near, halfHour])
    expect(result.duplicates).toEqual([
      { id: 'c1', offsetSeconds: -7200, originalId: 'o1' },
    ])
    expect(result.points.map((p) => p.id)).not.toContain('c1')
  })

  it('links a Live Photo clip to its still', () => {
    const still = media('s1', 0, 0)
    const clip = media('s2', 0, 1, { durationMs: 3000, kind: 'video' })
    const result = prepareMedia([still, clip])
    expect(result.points.find((p) => p.id === 's2')?.livePhotoOf).toBe('s1')
  })

  it('does not depend on the input order', () => {
    const items = [
      media('a', 0, 0),
      media('b', 1, 2),
      media('c', 2, 1, { latitude: null, longitude: null }),
      media('d', 3, 0),
    ]
    expect(prepareMedia([...items].reverse())).toEqual(prepareMedia(items))
  })
})
