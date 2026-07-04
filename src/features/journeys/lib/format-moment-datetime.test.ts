import { describe, expect, it } from 'vitest'
import {
  formatMomentDateTimeLabel,
  formatMomentTimelineLabel,
  formatMomentTimeLabel,
  isAutoDayGroup,
} from '@/features/journeys/lib/format-moment-datetime'

describe('format-moment-datetime', () => {
  const eventAt = '2026-06-12T18:30:00.000Z'

  it('formats time-only and full datetime labels', () => {
    expect(formatMomentTimeLabel(eventAt, 'en-US')).toMatch(/\d/)
    expect(formatMomentDateTimeLabel(eventAt, 'en-US')).toContain('2026')
  })

  it('returns null for missing or invalid timestamps', () => {
    expect(formatMomentTimeLabel(null, 'en-US')).toBeNull()
    expect(formatMomentDateTimeLabel('not-a-date', 'en-US')).toBeNull()
  })

  it('uses time in auto day groups and datetime elsewhere', () => {
    const inDay = formatMomentTimelineLabel(eventAt, 'en-US', true)
    const inStage = formatMomentTimelineLabel(eventAt, 'en-US', false)

    expect(inDay).not.toBeNull()
    expect(inStage).not.toBeNull()
    expect(inStage).not.toBe(inDay)
  })

  it('detects auto day groups', () => {
    expect(isAutoDayGroup({ dayKey: '2026-06-12', stage: null })).toBe(true)
    expect(
      isAutoDayGroup({
        dayKey: null,
        stage: { id: 'x', summary: '', title: 'Day' },
      }),
    ).toBe(false)
  })
})
