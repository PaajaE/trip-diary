import { describe, expect, it, vi } from 'vitest'
import type { Place } from '@/entities/place/model/place'
import { mom } from '@/features/journey-workspace/test-fixtures'
import {
  MAX_CONSECUTIVE_FAILURES,
  resolveMissingPlaces,
} from './resolve-places'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => {
    throw new Error('no network in tests')
  },
}))

const PLACE: Place = {
  countryCode: 'CA',
  id: '99999999-9999-4999-8999-999999999999',
  kind: 'settlement',
  latitude: 51.178,
  longitude: -115.571,
  name: 'Banff',
  region: 'Alberta',
}

describe('resolveMissingPlaces', () => {
  const near1 = mom(1, {
    latitude: 51.1784,
    longitude: -115.5708,
    startsAt: '2026-09-01T16:00:00+00:00',
  })
  // same ~110 m server cell as near1
  const near2 = mom(2, {
    latitude: 51.1782,
    longitude: -115.5711,
    startsAt: '2026-09-01T17:00:00+00:00',
  })
  const later = mom(3, {
    latitude: 50.2,
    longitude: -116,
    startsAt: '2026-09-03T16:00:00+00:00',
  })
  const named = mom(4, {
    latitude: 50.2,
    longitude: -116,
    placeId: PLACE.id,
  })

  it('looks each ~110 m cell up once, latest day first, never twice', async () => {
    const resolve = vi.fn((latitude: number, longitude: number) => {
      void longitude
      return Promise.resolve<Place | null>(latitude > 51 ? PLACE : null)
    })
    const setPlace = vi.fn(() => Promise.resolve(true))
    const cache = new Map<string, Place | null>()
    const onPlace = vi.fn()
    const result = await resolveMissingPlaces([near1, near2, later, named], {
      cache,
      minIntervalMs: 0,
      onPlace,
      resolve,
      setPlace,
    })
    expect(resolve.mock.calls.map((call) => call[0])).toEqual([50.2, 51.1784])
    expect(setPlace.mock.calls).toEqual([
      [near1.id, PLACE.id],
      [near2.id, PLACE.id],
    ])
    expect(onPlace).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      attempted: [later.id, near1.id, near2.id],
      gaveUp: false,
      named: 2,
    })
    // resumable: the cache answers a rerun without a lookup
    resolve.mockClear()
    await resolveMissingPlaces([near1], {
      cache,
      minIntervalMs: 0,
      resolve,
      setPlace,
    })
    expect(resolve).not.toHaveBeenCalled()
  })

  it('gives up after repeated failures and never throws', async () => {
    const stops = Array.from({ length: 6 }, (_, i) =>
      mom(10 + i, {
        latitude: 40 + i,
        longitude: 10,
        startsAt: '2026-09-01T16:00:00+00:00',
      }),
    )
    const resolve = vi.fn(() => Promise.reject(new Error('offline')))
    const result = await resolveMissingPlaces(stops, {
      cache: new Map(),
      minIntervalMs: 0,
      resolve,
      setPlace: vi.fn(() => Promise.resolve(true)),
    })
    expect(result.gaveUp).toBe(true)
    expect(resolve).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES)
  })

  it('stops when the caller stops it', async () => {
    let stop = false
    const resolve = vi.fn(() => {
      stop = true
      return Promise.resolve<Place | null>(PLACE)
    })
    const setPlace = vi.fn(() => Promise.resolve(true))
    await resolveMissingPlaces([near1, later], {
      cache: new Map(),
      minIntervalMs: 0,
      resolve,
      setPlace,
      stopped: () => stop,
    })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(setPlace).not.toHaveBeenCalled()
  })

  it('names only stops of the same cell: a lake and a peak 600 m apart get their own place', async () => {
    const lake = mom(20, { latitude: 51.4166, longitude: -116.2177 })
    const peak = mom(21, { latitude: 51.4166, longitude: -116.2091 })
    const resolve = vi.fn((latitude: number, longitude: number) =>
      Promise.resolve<Place | null>({
        ...PLACE,
        id:
          longitude < -116.21
            ? '11111111-1111-4111-8111-111111111111'
            : '22222222-2222-4222-8222-222222222222',
        latitude,
        longitude,
      }),
    )
    const setPlace = vi.fn((momentId: string, placeId: string) => {
      void momentId
      void placeId
      return Promise.resolve(true)
    })
    await resolveMissingPlaces([lake, peak], {
      cache: new Map(),
      minIntervalMs: 0,
      resolve,
      setPlace,
    })
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(
      [...setPlace.mock.calls].sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    ).toEqual([
      [lake.id, '11111111-1111-4111-8111-111111111111'],
      [peak.id, '22222222-2222-4222-8222-222222222222'],
    ])
  })

  it('spaces uncached lookups by the minimum interval, cached ones are not delayed', async () => {
    let clock = 1_000
    const waits: number[] = []
    const sleep = vi.fn((ms: number) => {
      waits.push(ms)
      clock += ms
      return Promise.resolve()
    })
    const stops = [0, 1, 2].map((i) =>
      mom(30 + i, {
        latitude: 40 + i,
        longitude: 10,
        startsAt: '2026-09-01T16:00:00+00:00',
      }),
    )
    const cache = new Map<string, Place | null>()
    const resolve = vi.fn(() => {
      clock += 50 // the request itself takes 50 ms
      return Promise.resolve<Place | null>(PLACE)
    })
    await resolveMissingPlaces(stops, {
      cache,
      now: () => clock,
      resolve,
      setPlace: vi.fn(() => Promise.resolve(true)),
      sleep,
    })
    expect(waits).toEqual([150, 150])
    sleep.mockClear()
    await resolveMissingPlaces(stops, {
      cache,
      now: () => clock,
      resolve,
      setPlace: vi.fn(() => Promise.resolve(true)),
      sleep,
    })
    expect(sleep).not.toHaveBeenCalled()
  })
})
