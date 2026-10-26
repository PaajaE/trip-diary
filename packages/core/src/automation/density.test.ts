import { describe, expect, it } from 'vitest'
import {
  localMedianGapMs,
  medianOf,
  sparsity,
  TIME_THRESHOLD_CEILING_MS,
  TIME_THRESHOLD_FLOOR_MS,
  timeThresholdMs,
} from './density.ts'

const MIN = 60_000

describe('density', () => {
  it('computes medians', () => {
    expect(medianOf([])).toBeNull()
    expect(medianOf([3, 1, 2])).toBe(2)
    expect(medianOf([1, 2, 3, 4])).toBe(2.5)
  })

  it('takes the local median gap of a window', () => {
    const times = [0, 1, 2, 3, 4, 5, 65, 125].map((m) => m * MIN)
    expect(localMedianGapMs(times, 2, 2)).toBe(MIN)
    expect(localMedianGapMs(times, 7, 2)).toBe(60 * MIN)
    expect(localMedianGapMs([0], 0)).toBeNull()
  })

  it('scales the threshold with the gap, between floor and ceiling', () => {
    expect(timeThresholdMs(null)).toBe(TIME_THRESHOLD_FLOOR_MS)
    expect(timeThresholdMs(MIN)).toBe(TIME_THRESHOLD_FLOOR_MS)
    expect(timeThresholdMs(5 * MIN)).toBe(20 * MIN)
    expect(timeThresholdMs(600 * MIN)).toBe(TIME_THRESHOLD_CEILING_MS)
  })

  it('slides smoothly from dense to sparse', () => {
    expect(sparsity(MIN)).toBe(0)
    expect(sparsity(null)).toBe(1)
    expect(sparsity(60 * MIN)).toBe(1)
    const middle = sparsity(10 * MIN)
    expect(middle).toBeGreaterThan(0)
    expect(middle).toBeLessThan(1)
  })
})
