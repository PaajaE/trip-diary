import { describe, expect, it } from 'vitest'
import { suggestStop } from './suggest-stop.ts'

const H = 3600_000
const base = Date.UTC(2026, 5, 1, 12, 0, 0)
const iso = (offsetMs: number) => new Date(base + offsetMs).toISOString()

function stop(
  id: string,
  startH: number,
  endH: number,
  lat: number | null = 50,
  lon: number | null = 14,
) {
  return {
    endsAt: iso(endH * H),
    id,
    latitude: lat,
    longitude: lon,
    startsAt: iso(startH * H),
  }
}
const photo = (
  h: number,
  lat: number | null = 50,
  lon: number | null = 14,
) => ({
  capturedAt: iso(h * H),
  latitude: lat,
  longitude: lon,
})
// ~0.001 deg latitude is about 111 m
const NEAR = 50.005
const FAR = 50.5

describe('suggestStop', () => {
  it('returns null without capturedAt or stops', () => {
    expect(
      suggestStop({ capturedAt: null, latitude: 50, longitude: 14 }, [
        stop('a', 0, 1),
      ]),
    ).toBeNull()
    expect(suggestStop(photo(0), [])).toBeNull()
  })

  it('picks the stop containing the time (edges inclusive)', () => {
    expect(suggestStop(photo(0.5), [stop('a', 0, 1), stop('b', 5, 6)])).toEqual(
      {
        reason: 'inside',
        stopId: 'a',
      },
    )
    expect(suggestStop(photo(1), [stop('a', 0, 1)])?.reason).toBe('inside')
  })

  it('inside ignores location', () => {
    expect(suggestStop(photo(0.5, FAR, 14), [stop('a', 0, 1)])?.reason).toBe(
      'inside',
    )
  })

  it('among several containing stops prefers closest centre, then id', () => {
    expect(
      suggestStop(photo(2), [stop('wide', 0, 10), stop('tight', 1, 3)])?.stopId,
    ).toBe('tight')
    expect(
      suggestStop(photo(1), [stop('b', 0, 2), stop('a', 0, 2)])?.stopId,
    ).toBe('a')
  })

  it('near_time: within window and close in place, or coordinates missing', () => {
    const s = [stop('a', 0, 1)]
    expect(suggestStop(photo(2, NEAR, 14), s)).toEqual({
      reason: 'near_time',
      stopId: 'a',
    })
    expect(suggestStop(photo(2, null, null), s)?.reason).toBe('near_time')
    expect(suggestStop(photo(2), [stop('a', 0, 1, null, null)])?.reason).toBe(
      'near_time',
    )
  })

  it('near_time picks the closest in time and respects limits', () => {
    expect(
      suggestStop(photo(3), [stop('a', 0, 1), stop('b', 3.5, 4)])?.stopId,
    ).toBe('b')
    expect(suggestStop(photo(5, null, null), [stop('a', 0, 1)])).toBeNull()
    expect(
      suggestStop(photo(5, null, null), [stop('a', 0, 1)], {
        nearTimeMs: 4 * H,
      })?.reason,
    ).toBe('near_time')
    // time near but place far
    expect(suggestStop(photo(2, FAR, 14), [stop('a', 0, 1)])).toBeNull()
  })

  it('near_place: close in place within 24 h but outside the time window', () => {
    const s = [stop('a', 0, 1)]
    expect(suggestStop(photo(10, NEAR, 14), s)).toEqual({
      reason: 'near_place',
      stopId: 'a',
    })
    expect(suggestStop(photo(30, NEAR, 14), s)).toBeNull()
    expect(suggestStop(photo(10, null, null), s)).toBeNull()
    expect(suggestStop(photo(10, FAR, 14), s)).toBeNull()
  })

  it('near_place picks the nearest, ties by id', () => {
    const s = [stop('a', 0, 1, 50.01, 14), stop('b', 0, 1, 50.002, 14)]
    expect(suggestStop(photo(10), s)?.stopId).toBe('b')
    const t = [stop('y', 0, 1), stop('x', 0, 1)]
    expect(suggestStop(photo(10), t)?.stopId).toBe('x')
  })

  it('is independent of stop order', () => {
    const s = [stop('a', 0, 1), stop('b', 3.5, 4), stop('c', 7, 8)]
    expect(suggestStop(photo(3), s)).toEqual(
      suggestStop(photo(3), [...s].reverse()),
    )
  })
})
