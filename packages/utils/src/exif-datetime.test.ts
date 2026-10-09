import { describe, expect, it } from 'vitest'
import {
  parseExifCaptureInstant,
  parseExifOffsetMinutes,
} from './exif-datetime.ts'

describe('parseExifOffsetMinutes', () => {
  it.each([
    ['-06:00', -360],
    ['+02:00', 120],
    ['+05:30', 330],
    ['-08:00', -480],
    ['+00:00', 0],
  ])('parses %s', (value, expected) => {
    expect(parseExifOffsetMinutes(value)).toBe(expected)
  })

  it.each([null, undefined, '', '0600', '-6:00', '+15:00', 'Z'])(
    'rejects %s',
    (value) => {
      expect(parseExifOffsetMinutes(value)).toBeNull()
    },
  )
})

describe('parseExifCaptureInstant', () => {
  it('converts Calgary summer wall clock (MDT) to UTC', () => {
    expect(parseExifCaptureInstant('2026:05:20 18:30:00', '-06:00')).toEqual({
      instant: '2026-05-21T00:30:00.000Z',
      offsetMinutes: -360,
    })
  })

  it('keeps the same instant for photos taken across a time-zone border', () => {
    // Haines (AKDT, -08:00) 10:00 and Haines Junction (Yukon, -07:00) 11:00
    // are the same moment.
    const alaska = parseExifCaptureInstant('2026:07:10 10:00:00', '-08:00')
    const yukon = parseExifCaptureInstant('2026:07:10 11:00:00', '-07:00')
    expect(alaska?.instant).toBe(yukon?.instant)
  })

  it('crosses the date line into the next UTC day', () => {
    expect(
      parseExifCaptureInstant('2026:08:31 23:59:59', '-07:00')?.instant,
    ).toBe('2026-09-01T06:59:59.000Z')
  })

  it('applies sub-second precision', () => {
    expect(
      parseExifCaptureInstant('2026:05:20 18:30:00', '+00:00', '25')?.instant,
    ).toBe('2026-05-20T18:30:00.250Z')
  })

  it('refuses to guess without an offset', () => {
    expect(parseExifCaptureInstant('2026:05:20 18:30:00', null)).toBeNull()
  })

  it.each(['2026:02:30 10:00:00', '2026-05-20 10:00:00', 'garbage'])(
    'rejects invalid date %s',
    (value) => {
      expect(parseExifCaptureInstant(value, '+00:00')).toBeNull()
    },
  )
})
