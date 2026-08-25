import { describe, expect, it } from 'vitest'
import { countJourneyDays } from '@/features/journeys/lib/count-journey-days'

describe('countJourneyDays', () => {
  it('counts inclusive calendar days', () => {
    expect(countJourneyDays('2026-07-01', '2026-07-28')).toBe(28)
  })

  it('returns null when dates are missing or inverted', () => {
    expect(countJourneyDays(null, '2026-07-28')).toBeNull()
    expect(countJourneyDays('2026-07-28', '2026-07-01')).toBeNull()
  })
})
