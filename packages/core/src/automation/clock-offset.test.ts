import { describe, expect, it } from 'vitest'
import { suggestClockOffsets, type ClockOffsetSample } from './clock-offset.ts'

const point = { latitude: 50.08, longitude: 14.42 }
const base = Date.parse('2026-06-10T10:00:00Z')

// `pairs` moments, both devices shoot them; B's clock is `skewSeconds` ahead.
function twoDevices(
  pairs: number,
  skewSeconds: (index: number) => number,
): ClockOffsetSample[] {
  return Array.from({ length: pairs }, (_, index) => {
    const time = base + index * 600_000
    return [
      { deviceId: 'A', id: `a${String(index)}`, point, time },
      {
        deviceId: 'B',
        id: `b${String(index)}`,
        point,
        time: time + skewSeconds(index) * 1000,
      },
    ]
  }).flat()
}

describe('suggestClockOffsets', () => {
  it('suggests the median when enough pairs agree', () => {
    const [suggestion] = suggestClockOffsets(twoDevices(8, () => 95))
    expect(suggestion).toMatchObject({
      code: 'TIME_SKEW_CORRECTED',
      pairs: 8,
    })
    // Equal shot counts: the later id is the one to shift, by -95 s.
    expect(suggestion?.deviceId).toBe('B')
    expect(suggestion?.offsetSeconds).toBe(-95)
    expect(suggestion?.confidence).toBeGreaterThan(0.5)
  })
  it('needs at least 5 pairs', () => {
    expect(suggestClockOffsets(twoDevices(4, () => 95))).toEqual([])
  })
  it('needs 80 % agreement', () => {
    expect(
      suggestClockOffsets(twoDevices(10, (i) => (i < 6 ? 95 : -80))),
    ).toEqual([])
    expect(
      suggestClockOffsets(twoDevices(10, (i) => (i < 8 ? 95 : -80))),
    ).toHaveLength(1)
  })
  it('ignores offsets of 30 s or less', () => {
    expect(suggestClockOffsets(twoDevices(8, () => 30))).toEqual([])
    expect(suggestClockOffsets(twoDevices(8, () => 31))).toHaveLength(1)
  })
  it('ignores shots far apart in space or on the same device', () => {
    const far = twoDevices(8, () => 95).map((sample) =>
      sample.deviceId === 'B'
        ? { ...sample, point: { latitude: 50.2, longitude: 14.42 } }
        : sample,
    )
    expect(suggestClockOffsets(far)).toEqual([])
    const same = twoDevices(8, () => 95).map((sample) => ({
      ...sample,
      deviceId: 'A',
    }))
    expect(suggestClockOffsets(same)).toEqual([])
  })
  it('shifts the device with fewer shots', () => {
    const samples = [
      ...twoDevices(8, () => 95),
      ...Array.from({ length: 5 }, (_, index) => ({
        deviceId: 'A',
        id: `x${String(index)}`,
        point: null,
        time: base + 9_000_000 + index * 1000,
      })),
    ]
    // A has more (located-only counts); A kept as the reference.
    const [suggestion] = suggestClockOffsets(samples)
    expect(suggestion?.referenceDeviceId).toBe('A')
  })
  it('is deterministic and does not depend on input order', () => {
    const samples = twoDevices(8, () => -140)
    expect(suggestClockOffsets([...samples].reverse())).toEqual(
      suggestClockOffsets(samples),
    )
  })
})
