import { describe, expect, it } from 'vitest'
import {
  browserZone,
  formatCompactRange,
  formatDayHeading,
  formatDuration,
  formatInstantTime,
  formatLocalTime,
  formatMomentSpan,
  mediaDisplayZone,
  formatRange,
  formatSpan,
} from '@/features/journey-workspace/lib/format-range'

// Winter instant: Prague is UTC+1; Asia/Tokyo is UTC+9 with no DST at all.
const INSTANT = '2026-01-15T10:30:00+00:00'

describe('format-range', () => {
  it('formats the same instant in the given zone, not the device zone', () => {
    expect(formatInstantTime(INSTANT, 'Europe/Prague', 'en-GB')).toBe('11:30')
    expect(formatInstantTime(INSTANT, 'Asia/Tokyo', 'en-GB')).toBe('19:30')
    expect(formatInstantTime(INSTANT, 'UTC', 'en-GB')).toBe('10:30')
  })

  it('falls back to the device zone without naming UTC when none is known', () => {
    const device = formatLocalTime(INSTANT, browserZone(), 'en-GB')
    expect(formatInstantTime(INSTANT, null, 'en-GB')).toBe(device)
    expect(formatInstantTime(INSTANT, 'Not/AZone', 'en-GB')).toBe(device)
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

  describe('formatCompactRange', () => {
    const flat = (text: string) => text.replace(/\s+/g, ' ')

    it('shows a compact date range without a zone label', () => {
      const text = flat(
        formatCompactRange(
          '2026-05-28T20:23:00+00:00',
          '2026-06-02T21:42:00+00:00',
          'Europe/Prague',
          'cs',
          { withTime: false, withYear: true },
        ),
      )
      expect(text).toContain('28. 5.')
      expect(text).toContain('2. 6. 2026')
      expect(text).not.toContain('UTC')
    })

    it('shows one date for a single-day range and times for moments', () => {
      const text = flat(
        formatCompactRange(
          '2026-05-28T20:23:00+00:00',
          '2026-05-28T21:42:00+00:00',
          'Europe/Prague',
          'cs',
          { withTime: true, withYear: false },
        ),
      )
      expect(text).toBe('28. 5., 22:23 – 23:42')
    })

    it('never names UTC, even without a zone', () => {
      const text = formatCompactRange(INSTANT, INSTANT, null, 'en-GB', {
        withTime: true,
        withYear: true,
      })
      expect(text).not.toContain('UTC')
      expect(text).toContain(formatLocalTime(INSTANT, null, 'en-GB'))
    })
  })
})

describe('formatDayHeading', () => {
  it('writes the long weekday and date in the capture zone', () => {
    const at = '2026-06-03T12:00:00+00:00'
    expect(formatDayHeading(at, 'America/Edmonton', 'cs')).toBe(
      'Středa 3. června',
    )
    expect(formatDayHeading(at, 'America/Edmonton', 'en')).toBe(
      'Wednesday 3 June',
    )
    // 03:00 UTC is still the 2nd in Edmonton.
    expect(
      formatDayHeading('2026-06-03T03:00:00+00:00', 'America/Edmonton', 'en'),
    ).toBe('Tuesday 2 June')
  })
})

describe('formatSpan', () => {
  const at = '2026-06-03T10:00:00+00:00'
  it('formats minutes and hours, empty below a minute', () => {
    expect(formatSpan(at, '2026-06-03T10:02:00+00:00')).toBe('2 min')
    expect(formatSpan(at, '2026-06-03T11:15:00+00:00')).toBe('1 h 15 min')
    expect(formatSpan(at, '2026-06-03T12:00:00+00:00')).toBe('2 h')
    expect(formatSpan(at, '2026-06-03T10:00:20+00:00')).toBe('')
    expect(formatSpan(at, at)).toBe('')
    expect(formatSpan(at, 'garbage')).toBe('')
  })
})

describe('formatLocalTime', () => {
  it('never prints a zone label, even without a known zone', () => {
    expect(formatLocalTime(INSTANT, 'Asia/Tokyo', 'en-GB')).toBe('19:30')
    for (const tz of [null, 'Not/AZone']) {
      const text = formatLocalTime(INSTANT, tz, 'en-GB')
      expect(text).toMatch(/^\d{2}:\d{2}$/)
      expect(text).not.toContain('UTC')
    }
  })
})

describe('mediaDisplayZone', () => {
  const base = { capturedTz: null, latitude: null, longitude: null }
  it('prefers capture zone, then coordinates, then the moment zone', () => {
    expect(
      mediaDisplayZone({ ...base, capturedTz: 'Asia/Tokyo' }, 'Europe/Paris'),
    ).toBe('Asia/Tokyo')
    expect(
      mediaDisplayZone(
        { ...base, latitude: 43.65, longitude: -79.38 },
        'Europe/Paris',
      ),
    ).toBe('America/Toronto')
    expect(mediaDisplayZone(base, 'Europe/Paris')).toBe('Europe/Paris')
    expect(mediaDisplayZone(base, null)).toBeNull()
  })
})

describe('formatMomentSpan', () => {
  const Z = 'America/Toronto'
  it('keeps the duration for short moments within one local day', () => {
    expect(
      formatMomentSpan(
        '2026-05-26T14:00:00+00:00',
        '2026-05-26T15:15:00+00:00',
        Z,
        'en',
      ),
    ).toBe('1 h 15 min')
  })

  it('shows dates for a moment of 12 h or more', () => {
    expect(
      formatMomentSpan(
        '2026-05-26T14:00:00+00:00',
        '2026-05-27T14:50:00+00:00',
        Z,
        'cs',
      ),
    ).toBe('26.\u201327. 5.')
    expect(
      formatMomentSpan(
        '2026-05-26T14:00:00+00:00',
        '2026-05-27T14:50:00+00:00',
        Z,
        'en',
      ),
    ).toBe('26\u201327 May')
  })

  it('shows dates when a short moment crosses a local midnight', () => {
    // 23:30 to 00:30 in Toronto (UTC-4 in May).
    expect(
      formatMomentSpan(
        '2026-05-27T03:30:00+00:00',
        '2026-05-27T04:30:00+00:00',
        Z,
        'cs',
      ),
    ).toBe('26.\u201327. 5.')
  })

  it('handles a month boundary and a single day of 12 h or more', () => {
    expect(
      formatMomentSpan(
        '2026-09-30T10:00:00+00:00',
        '2026-10-02T10:00:00+00:00',
        'UTC',
        'cs',
      ),
    ).toBe('30. 9.\u20132. 10.')
    expect(
      formatMomentSpan(
        '2026-05-26T06:00:00+00:00',
        '2026-05-26T19:00:00+00:00',
        'UTC',
        'cs',
      ),
    ).toBe('26. 5.')
  })
})
