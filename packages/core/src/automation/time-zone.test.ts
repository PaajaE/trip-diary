import { describe, expect, it } from 'vitest'
import {
  resolveCaptureZone,
  timeZoneAt,
  wallClockToInstant,
  zoneOffsetMinutes,
} from './time-zone.ts'

describe('timeZoneAt', () => {
  it.each([
    ['Calgary', 51.045, -114.06, 'America/Edmonton'],
    // Yoho / Golden are in British Columbia but keep Mountain time.
    ['Golden', 51.3, -116.97, 'America/Edmonton'],
    ['Prince Rupert', 54.315, -130.32, 'America/Vancouver'],
    ['Skagway', 59.4583, -135.3139, 'America/Juneau'],
    ['Haines Junction', 60.75, -137.51, 'America/Whitehorse'],
    ['Dawson City', 64.06, -139.43, 'America/Dawson'],
    ['Prague', 50.0755, 14.4378, 'Europe/Prague'],
  ])('%s', (_name, latitude, longitude, zone) => {
    expect(timeZoneAt(latitude, longitude)).toBe(zone)
  })
})

describe('zoneOffsetMinutes', () => {
  it('follows daylight saving time', () => {
    // Europe/Prague has stable DST rules. Do not use zones whose rules are
    // being changed by law (America/Edmonton moves to permanent -06 in
    // tzdata 2026c, so winter offsets depend on the Node/ICU version).
    expect(
      zoneOffsetMinutes('Europe/Prague', Date.parse('2026-07-01T12:00:00Z')),
    ).toBe(120)
    expect(
      zoneOffsetMinutes('Europe/Prague', Date.parse('2026-12-01T12:00:00Z')),
    ).toBe(60)
  })

  it('handles zones without daylight saving time', () => {
    // Yukon stays on UTC-7 all year.
    expect(
      zoneOffsetMinutes(
        'America/Whitehorse',
        Date.parse('2026-12-01T12:00:00Z'),
      ),
    ).toBe(-420)
    expect(zoneOffsetMinutes('UTC', 0)).toBe(0)
  })
})

describe('resolveCaptureZone', () => {
  const base = {
    capturedAt: '2026-07-14T18:00:00Z',
    exifOffsetMinutes: null,
    homeTimeZone: 'America/Edmonton',
    latitude: null,
    longitude: null,
  }

  it('prefers the GPS position', () => {
    expect(
      resolveCaptureZone({
        ...base,
        exifOffsetMinutes: -480,
        latitude: 59.4583,
        longitude: -135.3139,
      }),
    ).toEqual({ source: 'gps', timeZone: 'America/Juneau' })
  })

  it('uses the home zone when the camera offset matches it', () => {
    expect(resolveCaptureZone({ ...base, exifOffsetMinutes: -360 })).toEqual({
      source: 'home',
      timeZone: 'America/Edmonton',
    })
  })

  it('falls back to a fixed-offset zone for other camera offsets', () => {
    expect(resolveCaptureZone({ ...base, exifOffsetMinutes: -480 })).toEqual({
      source: 'exif-offset',
      timeZone: 'Etc/GMT+8',
    })
    expect(resolveCaptureZone({ ...base, exifOffsetMinutes: 120 })).toEqual({
      source: 'exif-offset',
      timeZone: 'Etc/GMT-2',
    })
  })

  it('falls back to the home zone, or nothing', () => {
    expect(resolveCaptureZone(base)?.source).toBe('home')
    expect(resolveCaptureZone({ ...base, homeTimeZone: null })).toBeNull()
  })
})

describe('wallClockToInstant', () => {
  it('interprets an offset-less EXIF time in the capture zone', () => {
    // The spike found PhotoKit used the device zone for such photos.
    expect(wallClockToInstant('2026:09:11 12:00:00', 'America/Edmonton')).toBe(
      '2026-09-11T18:00:00.000Z',
    )
    expect(wallClockToInstant('2026:07:14 10:00:00', 'America/Juneau')).toBe(
      '2026-07-14T18:00:00.000Z',
    )
  })

  it('is correct right after the spring DST change', () => {
    // 2026-03-08 03:30 MDT (clocks jumped from 02:00 MST to 03:00 MDT)
    expect(wallClockToInstant('2026-03-08 03:30:00', 'America/Edmonton')).toBe(
      '2026-03-08T09:30:00.000Z',
    )
  })

  it('rejects malformed input', () => {
    expect(wallClockToInstant('yesterday', 'UTC')).toBeNull()
  })
})
