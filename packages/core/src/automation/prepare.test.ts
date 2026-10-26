import { describe, expect, it } from 'vitest'
import type { MediaPoint } from './media-point.ts'
import { prepareMedia } from './prepare.ts'

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
    const first = result.points.find((p) => p.id === 'cam0')
    expect(first?.time).toBe(START + (1 - 180) * MIN)
    expect(first?.workTime).toBe(first?.time ? first.time + 3 * HOUR : 0)
    const plain = prepareMedia([...phone, ...camera], {
      applyProposedClockShifts: false,
    })
    expect(plain.clockShiftProposals).toHaveLength(1)
    expect(plain.points.find((p) => p.id === 'cam0')?.shiftMs).toBe(0)
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
