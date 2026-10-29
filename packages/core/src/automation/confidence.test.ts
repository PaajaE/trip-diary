import { describe, expect, it } from 'vitest'
import {
  combineConfidence,
  confidenceBand,
  confidenceFromMargin,
  reviewQueue,
} from './confidence.ts'

describe('confidenceFromMargin', () => {
  it('is a coin flip at the threshold and certain far from it', () => {
    expect(confidenceFromMargin(10, 10, 5)).toBe(0.5)
    expect(confidenceFromMargin(15, 10, 5)).toBe(1)
    expect(confidenceFromMargin(100, 10, 5)).toBe(1)
    expect(confidenceFromMargin(5, 10, 5)).toBe(1)
  })
  it('rises with the margin on either side', () => {
    expect(confidenceFromMargin(12.5, 10, 5)).toBeCloseTo(0.75)
    expect(confidenceFromMargin(7.5, 10, 5)).toBeCloseTo(0.75)
  })
  it('gives 0.5 without evidence', () => {
    expect(confidenceFromMargin(Number.NaN, 10, 5)).toBe(0.5)
    expect(confidenceFromMargin(12, 10, 0)).toBe(0.5)
  })
})

describe('bands', () => {
  it('splits at 0.85 and 0.50', () => {
    expect(confidenceBand(0.85)).toBe('auto')
    expect(confidenceBand(0.84)).toBe('review')
    expect(confidenceBand(0.5)).toBe('review')
    expect(confidenceBand(0.49)).toBe('unplaced')
  })
  it('orders the review queue least certain first', () => {
    const items = [
      { confidence: 0.7, id: 'b' },
      { confidence: 0.9, id: 'auto' },
      { confidence: 0.6, id: 'a' },
      { confidence: 0.3, id: 'lost' },
      { confidence: 0.6, id: '0' },
    ]
    expect(reviewQueue(items).map((item) => item.id)).toEqual(['0', 'a', 'b'])
  })
  it('combines to the weakest signal', () => {
    expect(combineConfidence(0.9, 0.6, 0.8)).toBe(0.6)
    expect(combineConfidence()).toBe(0.5)
  })
})
