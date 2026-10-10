import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatInstantTime,
  formatRange,
} from '@/features/journey-workspace/lib/format-range'

// Winter instant: Prague is UTC+1; Asia/Tokyo is UTC+9 with no DST at all.
const INSTANT = '2026-01-15T10:30:00+00:00'

describe('format-range', () => {
  it('formats the same instant in the given zone, not the device zone', () => {
    expect(formatInstantTime(INSTANT, 'Europe/Prague', 'en-GB')).toBe('11:30')
    expect(formatInstantTime(INSTANT, 'Asia/Tokyo', 'en-GB')).toBe('19:30')
    expect(formatInstantTime(INSTANT, 'UTC', 'en-GB')).toBe('10:30')
  })

  it('names the zone explicitly when none is known', () => {
    expect(formatInstantTime(INSTANT, null, 'en-GB')).toContain('UTC')
    expect(formatInstantTime(INSTANT, 'Not/AZone', 'en-GB')).toContain('UTC')
  })

  it('uses the zone to decide whether a range spans days', () => {
    // 23:30 UTC on the 15th is already the 16th in Tokyo.
    const start = '2026-01-15T22:00:00+00:00'
    const end = '2026-01-15T23:30:00+00:00'
    const utc = formatRange(start, end, 'UTC', 'en-GB', { withTime: true })
    const tokyo = formatRange(start, end, 'Asia/Tokyo', 'en-GB', {
      withTime: true,
    })
    expect(utc).toBe('15 Jan 2026, 22:00 – 23:30')
    expect(tokyo).toBe('16 Jan 2026, 07:00 – 08:30')
  })

  it('formats multi-day ranges', () => {
    expect(
      formatRange(
        '2026-01-15T10:00:00+00:00',
        '2026-01-18T10:00:00+00:00',
        'Europe/Prague',
        'en-GB',
        { withTime: false },
      ),
    ).toBe('15 Jan 2026 – 18 Jan 2026')
  })

  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(0)).toBe('0:00')
  })
})
