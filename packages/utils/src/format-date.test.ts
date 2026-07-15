import { describe, expect, it } from 'vitest'
import {
  formatJourneyDateRange,
  formatLocalizedDate,
  resolveDateLocale,
} from './format-date'

describe('resolveDateLocale', () => {
  it('maps Czech language codes to cs-CZ', () => {
    expect(resolveDateLocale('cs')).toBe('cs-CZ')
  })

  it('falls back to en-US for other languages', () => {
    expect(resolveDateLocale('en')).toBe('en-US')
    expect(resolveDateLocale('de')).toBe('en-US')
  })
})

describe('formatLocalizedDate', () => {
  it('formats ISO dates for the requested locale', () => {
    expect(formatLocalizedDate('2026-07-10T12:00:00.000Z', 'en-US')).toContain(
      '2026',
    )
    expect(formatLocalizedDate('2026-07-10T12:00:00.000Z', 'cs-CZ')).toContain(
      '2026',
    )
  })
})

describe('formatJourneyDateRange', () => {
  it('returns the unknown label when both dates are missing', () => {
    expect(formatJourneyDateRange(null, null, 'en-US', 'Dates not set')).toBe(
      'Dates not set',
    )
  })

  it('formats a single-sided range', () => {
    const formatted = formatJourneyDateRange(
      '2026-07-10T00:00:00.000Z',
      null,
      'en-US',
      'Dates not set',
    )

    expect(formatted).toContain('2026')
  })

  it('formats both ends of a range', () => {
    const formatted = formatJourneyDateRange(
      '2026-07-01T00:00:00.000Z',
      '2026-07-10T00:00:00.000Z',
      'en-US',
      'Dates not set',
    )

    expect(formatted).toContain('–')
    expect(formatted).toContain('2026')
  })
})
