import { describe, expect, it } from 'vitest'
import { normalizePhotoCapturedAt } from './normalize-captured-at'

describe('normalizePhotoCapturedAt', () => {
  it('returns null for missing values', () => {
    expect(normalizePhotoCapturedAt(null)).toBeNull()
    expect(normalizePhotoCapturedAt(undefined)).toBeNull()
    expect(normalizePhotoCapturedAt('')).toBeNull()
    expect(normalizePhotoCapturedAt('   ')).toBeNull()
  })

  it('converts EXIF YYYY:MM:DD HH:mm:ss to ISO-8601', () => {
    const normalized = normalizePhotoCapturedAt('2026:07:10 14:30:00')
    expect(normalized).toMatch(/^2026-07-10T\d{2}:30:00\.\d{3}Z$/)
    expect(new Date(normalized!).toISOString()).toBe(normalized)
  })

  it('accepts canonical ISO input', () => {
    expect(normalizePhotoCapturedAt('2026-07-10T14:30:00.000Z')).toBe(
      '2026-07-10T14:30:00.000Z',
    )
  })

  it('returns null for malformed strings', () => {
    expect(normalizePhotoCapturedAt('not-a-date')).toBeNull()
    expect(normalizePhotoCapturedAt('2026/07/10 14:30:00')).toBeNull()
    expect(normalizePhotoCapturedAt('2026:07:10')).toBeNull()
  })

  it('returns null for impossible calendar dates', () => {
    expect(normalizePhotoCapturedAt('2026:02:31 10:00:00')).toBeNull()
    expect(normalizePhotoCapturedAt('2026:13:10 10:00:00')).toBeNull()
    expect(normalizePhotoCapturedAt('2026:07:10 25:00:00')).toBeNull()
  })

  it('trims surrounding whitespace before parsing', () => {
    const normalized = normalizePhotoCapturedAt('  2026:07:10 14:30:00  ')
    expect(normalized).toMatch(/^2026-07-10T\d{2}:30:00\.\d{3}Z$/)
  })
})
