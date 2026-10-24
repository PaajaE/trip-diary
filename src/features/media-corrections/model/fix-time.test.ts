import { describe, expect, it } from 'vitest'
import {
  DAY,
  HOUR,
  MAX_SHIFT_SECONDS,
  shiftableCount,
  shiftPreview,
  SHIFT_PRESETS,
  splitShift,
  stepShift,
  validateShift,
} from '@/features/media-corrections/model/fix-time'

const prague = {
  capturedAt: '2026-05-28T21:30:00.000Z',
  capturedTz: 'Europe/Prague',
}

describe('validateShift', () => {
  it('accepts up to 366 days either way, flags zero and larger', () => {
    expect(MAX_SHIFT_SECONDS).toBe(366 * DAY)
    expect(validateShift(3600)).toBe('ok')
    expect(validateShift(-MAX_SHIFT_SECONDS)).toBe('ok')
    expect(validateShift(MAX_SHIFT_SECONDS)).toBe('ok')
    expect(validateShift(MAX_SHIFT_SECONDS + 1)).toBe('tooLarge')
    expect(validateShift(-MAX_SHIFT_SECONDS - 1)).toBe('tooLarge')
    expect(validateShift(0)).toBe('zero')
    expect(validateShift(1.5)).toBe('tooLarge')
  })
})

describe('shiftableCount', () => {
  it('counts only items with a capture time', () => {
    expect(
      shiftableCount([prague, { capturedAt: null, capturedTz: null }, prague]),
    ).toBe(2)
    expect(shiftableCount([])).toBe(0)
  })
})

describe('shiftPreview', () => {
  it('shows the first timed item in its own zone before and after', () => {
    const preview = shiftPreview(
      [{ capturedAt: null, capturedTz: null }, prague],
      HOUR,
      'cs',
    )
    // 21:30 UTC is 23:30 in Prague (CEST); +1 h crosses midnight.
    expect(preview?.before.time).toBe('23:30')
    expect(preview?.after.time).toBe('00:30')
    expect(preview?.dateChanges).toBe(true)
    expect(preview?.before.date).not.toBe(preview?.after.date)
  })

  it('keeps the date for a small shift and handles negatives', () => {
    const preview = shiftPreview([prague], -30 * 60, 'cs')
    expect(preview?.before.time).toBe('23:30')
    expect(preview?.after.time).toBe('23:00')
    expect(preview?.dateChanges).toBe(false)
  })

  it('is null without any capture time', () => {
    expect(
      shiftPreview([{ capturedAt: null, capturedTz: null }], HOUR, 'cs'),
    ).toBeNull()
  })

  it('uses the fallback zone when the item has no zone', () => {
    const preview = shiftPreview(
      [{ capturedAt: prague.capturedAt, capturedTz: null }],
      0,
      'cs',
      'Asia/Tokyo',
    )
    expect(preview?.before.time).toBe('06:30')
  })
})

describe('stepping', () => {
  it('adds presets and stepper presses to the shift', () => {
    expect(stepShift(0, SHIFT_PRESETS.hourMinus)).toBe(-HOUR)
    expect(stepShift(-HOUR, SHIFT_PRESETS.halfHourPlus)).toBe(-1800)
    expect(stepShift(0, SHIFT_PRESETS.dayAhead)).toBe(-DAY)
    expect(stepShift(HOUR, 60)).toBe(3660)
  })

  it('splits a shift into sign, hours and minutes', () => {
    expect(splitShift(0)).toEqual({ hours: 0, minutes: 0, negative: false })
    expect(splitShift(-5400)).toEqual({ hours: 1, minutes: 30, negative: true })
    expect(splitShift(DAY + 120)).toEqual({
      hours: 24,
      minutes: 2,
      negative: false,
    })
  })
})
