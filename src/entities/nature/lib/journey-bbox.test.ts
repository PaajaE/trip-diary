import { describe, expect, it } from 'vitest'
import {
  bboxCacheKey,
  bboxCenter,
  computeJourneyBbox,
} from '@/entities/nature/lib/journey-bbox'

describe('computeJourneyBbox', () => {
  it('builds a bbox from moments and pads a single point', () => {
    const bbox = computeJourneyBbox({
      moments: [{ location: { latitude: 50, longitude: 14 } }],
    })

    expect(bbox?.minLatitude).toBeLessThan(50)
    expect(bbox?.maxLatitude).toBeGreaterThan(50)
  })

  it('falls back to template center when no coordinates exist', () => {
    const bbox = computeJourneyBbox({
      moments: [{ location: null }],
      templateCenter: { latitude: 48.97, longitude: 13.36 },
    })

    if (bbox === null) {
      throw new Error('expected bbox')
    }
    expect(bboxCenter(bbox).latitude).toBeCloseTo(48.97, 2)
    expect(bboxCacheKey(bbox).length).toBeGreaterThan(0)
  })
})
