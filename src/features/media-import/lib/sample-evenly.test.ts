import { describe, expect, it } from 'vitest'
import { sampleEvenly } from '@/features/media-import/lib/sample-evenly'

describe('sampleEvenly', () => {
  it('returns everything when the list is not larger than the sample', () => {
    expect(sampleEvenly([1, 2, 3], 5)).toEqual([1, 2, 3])
    expect(sampleEvenly([1, 2, 3], 0)).toEqual([])
  })

  it('spreads picks over the whole list in order', () => {
    const items = Array.from({ length: 100 }, (_, i) => i)
    const picked = sampleEvenly(items, 4)
    expect(picked).toEqual([0, 25, 50, 75])
    expect(sampleEvenly(items, 50)).toHaveLength(50)
  })
})
