import { describe, expect, it } from 'vitest'
import {
  dragRange,
  dragSelection,
  edgeScrollDelta,
  selectionDiff,
} from './drag-range'

// Two day sections flattened in reading order: a b c | d e | f
const ORDER = ['a', 'b', 'c', 'd', 'e', 'f']

describe('dragRange', () => {
  it('is only the anchor while the pointer is on it', () => {
    expect(dragRange(ORDER, 'c', 'c')).toEqual(['c'])
  })
  it('runs forward and backward in reading order', () => {
    expect(dragRange(ORDER, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(dragRange(ORDER, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })
  it('crosses day sections without a gap', () => {
    expect(dragRange(ORDER, 'c', 'e')).toEqual(['c', 'd', 'e'])
  })
  it('works on a filtered order (hidden media are not in between)', () => {
    expect(dragRange(['a', 'c', 'e'], 'a', 'e')).toEqual(['a', 'c', 'e'])
  })
  it('falls back to the anchor for an unknown tile and is empty without anchor', () => {
    expect(dragRange(ORDER, 'b', 'zz')).toEqual(['b'])
    expect(dragRange(ORDER, 'zz', 'b')).toEqual([])
  })
})

describe('dragSelection', () => {
  it('keeps the earlier selection and shrinks only the range', () => {
    const base = new Set(['a'])
    expect([...dragSelection(base, ORDER, 'c', 'e')].sort()).toEqual([
      'a',
      'c',
      'd',
      'e',
    ])
    expect([...dragSelection(base, ORDER, 'c', 'd')].sort()).toEqual([
      'a',
      'c',
      'd',
    ])
    expect([...dragSelection(base, ORDER, 'c', 'c')].sort()).toEqual(['a', 'c'])
  })
})

describe('selectionDiff', () => {
  it('lists additions and removals', () => {
    expect(selectionDiff(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({
      add: ['c'],
      remove: ['a'],
    })
  })
})

describe('edgeScrollDelta', () => {
  it('scrolls up near the top, down near the bottom, not in the middle', () => {
    expect(edgeScrollDelta(10, 800)).toBeLessThan(0)
    expect(edgeScrollDelta(790, 800)).toBeGreaterThan(0)
    expect(edgeScrollDelta(400, 800)).toBe(0)
  })
  it('is faster closer to the edge and capped', () => {
    expect(Math.abs(edgeScrollDelta(0, 800))).toBeGreaterThan(
      Math.abs(edgeScrollDelta(60, 800)),
    )
    expect(edgeScrollDelta(-500, 800)).toBe(-18)
  })
})
