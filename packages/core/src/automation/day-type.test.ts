import { describe, expect, it } from 'vitest'
import { classifyDayType, type DayTypeStop } from './day-type.ts'

const base = { latitude: 51.18, longitude: -115.57 }
// ~111 km per degree of latitude.
const north = (km: number) => ({
  latitude: base.latitude + km / 111,
  longitude: base.longitude,
})
const stop = (km: number, minutes = 30): DayTypeStop => ({
  minutes,
  point: north(km),
})

describe('classifyDayType', () => {
  it('transfer: the base moved over 150 km', () => {
    const result = classifyDayType({
      baseEnd: north(300),
      baseStart: base,
      stops: [stop(10), stop(300)],
    })
    expect(result.type).toBe('transfer')
    expect(result.confidence).toBeGreaterThan(0.85)
  })
  it('is a transfer just over the threshold only with a weak confidence', () => {
    const result = classifyDayType({
      baseEnd: north(160),
      baseStart: base,
      stops: [stop(160)],
    })
    expect(result.type).toBe('transfer')
    expect(result.confidence).toBeLessThan(0.6)
  })
  it('trip: far from the base and back for the night', () => {
    const result = classifyDayType({
      baseEnd: base,
      baseStart: base,
      stops: [stop(1), stop(35), stop(36), stop(1)],
    })
    expect(result.type).toBe('trip')
    expect(result.reason).toBe('FAR_FROM_BASE_RETURNED')
  })
  it('on foot a trip starts at 5 km', () => {
    const input = {
      baseEnd: base,
      baseStart: base,
      stops: [stop(0.5), stop(8)],
    }
    expect(classifyDayType(input).type).toBe('stay')
    expect(classifyDayType({ ...input, onFoot: true }).type).toBe('trip')
  })
  it('stay: most of the time near the base', () => {
    expect(
      classifyDayType({
        baseEnd: base,
        baseStart: base,
        stops: [stop(1, 300), stop(3, 120), stop(9, 30)],
      }).type,
    ).toBe('stay')
  })
  it('city: many stops in a short distance', () => {
    const stops = [0.2, 0.5, 0.9, 1.3, 1.6, 2, 2.4].map((km) => stop(km, 20))
    const result = classifyDayType({ baseEnd: base, baseStart: base, stops })
    expect(result.type).toBe('city')
    expect(result.reason).toBe('MANY_STOPS_CLOSE')
  })
  it('without data it stays undecided', () => {
    expect(
      classifyDayType({ baseEnd: null, baseStart: null, stops: [] }),
    ).toEqual({ confidence: 0.5, reason: 'NO_DATA', type: 'stay' })
  })
  it('is deterministic', () => {
    const input = { baseEnd: base, baseStart: base, stops: [stop(2), stop(40)] }
    expect(classifyDayType(input)).toEqual(classifyDayType(input))
  })
})
