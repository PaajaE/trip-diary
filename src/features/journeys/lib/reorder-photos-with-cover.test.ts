import { describe, expect, it } from 'vitest'
import {
  nextCoverIndexAfterRemoval,
  reorderPhotosWithCover,
} from '@/features/journeys/lib/reorder-photos-with-cover'

describe('reorderPhotosWithCover', () => {
  it('keeps order when cover is already first', () => {
    expect(reorderPhotosWithCover(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c'])
  })

  it('moves a non-first cover to the front', () => {
    expect(reorderPhotosWithCover(['a', 'b', 'c'], 2)).toEqual(['c', 'a', 'b'])
  })

  it('clamps an out-of-range cover index', () => {
    expect(reorderPhotosWithCover(['a', 'b'], 99)).toEqual(['b', 'a'])
  })
})

describe('nextCoverIndexAfterRemoval', () => {
  it('returns null when no photos remain', () => {
    expect(nextCoverIndexAfterRemoval(0, 0, 0)).toBeNull()
  })

  it('promotes the next photo when cover is removed', () => {
    expect(nextCoverIndexAfterRemoval(0, 0, 2)).toBe(0)
  })

  it('shifts cover index when an earlier photo is removed', () => {
    expect(nextCoverIndexAfterRemoval(0, 2, 2)).toBe(1)
  })

  it('keeps cover index when a later photo is removed', () => {
    expect(nextCoverIndexAfterRemoval(2, 0, 2)).toBe(0)
  })
})
