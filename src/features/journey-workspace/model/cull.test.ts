import { describe, expect, it } from 'vitest'
import {
  advanceTarget,
  countStarred,
  dropAction,
  nearestVisible,
  popAction,
  positionAmongVisible,
  pushAction,
  starActionFor,
  stepIndex,
  summarize,
  type CullEntry,
} from '@/features/journey-workspace/model/cull'

const e = (id: string, starred = false, trashed = false): CullEntry => ({
  id,
  starred,
  trashed,
})

describe('cull navigation', () => {
  const list = [e('a'), e('b', true), e('c', false, true), e('d', true), e('f')]

  it('steps over trashed entries', () => {
    expect(stepIndex(list, false, 1, 1)).toBe(3)
    expect(stepIndex(list, false, 3, -1)).toBe(1)
    expect(stepIndex(list, false, 4, 1)).toBeNull()
    expect(stepIndex(list, false, 0, -1)).toBeNull()
  })

  it('steps only over starred entries with the filter', () => {
    expect(stepIndex(list, true, 0, 1)).toBe(1)
    expect(stepIndex(list, true, 1, 1)).toBe(3)
    expect(stepIndex(list, true, 3, 1)).toBeNull()
  })

  it('advances forward, then backward, then null', () => {
    expect(advanceTarget(list, false, 0)).toBe(1)
    expect(advanceTarget(list, false, 4)).toBe(3)
    expect(advanceTarget([e('a', false, true)], false, 0)).toBeNull()
    expect(advanceTarget([e('a')], false, 0)).toBeNull()
  })

  it('finds the nearest visible entry', () => {
    expect(nearestVisible(list, false, 2)).toBe(3)
    expect(nearestVisible(list, false, 0)).toBe(0)
    expect(nearestVisible(list, true, 0)).toBe(1)
  })

  it('counts positions among visible entries', () => {
    expect(positionAmongVisible(list, false, 3)).toBe(3)
    expect(positionAmongVisible(list, false, 2)).toBe(0)
    expect(positionAmongVisible(list, true, 3)).toBe(2)
  })

  it('counts starred, ignoring trashed', () => {
    expect(countStarred([e('a', true), e('b', true, true), e('c')])).toBe(1)
  })
})

describe('cull history', () => {
  it('maps the star key to a toggle', () => {
    expect(starActionFor(e('a'))).toBe('star')
    expect(starActionFor(e('a', true))).toBe('unstar')
  })

  it('pushes, pops (LIFO) and drops', () => {
    let h = pushAction([], { id: 'a', type: 'star' })
    h = pushAction(h, { id: 'b', type: 'trash' })
    h = pushAction(h, { id: 'a', type: 'unstar' })
    expect(popAction(h).action).toEqual({ id: 'a', type: 'unstar' })
    expect(popAction(h).history).toHaveLength(2)
    expect(dropAction(h, { id: 'b', type: 'trash' })).toHaveLength(2)
    expect(dropAction(h, { id: 'x', type: 'trash' })).toBe(h)
    expect(popAction([])).toEqual({ action: null, history: [] })
  })

  it('summarizes only work that still stands', () => {
    const history = [
      { id: 'a', type: 'star' as const },
      { id: 'b', type: 'star' as const },
      { id: 'c', type: 'trash' as const },
      { id: 'd', type: 'trash' as const },
    ]
    // b was unstarred later, d restored via the toast.
    const entries = [e('a', true), e('b'), e('c', false, true), e('d')]
    expect(summarize(history, entries)).toEqual({ starred: 1, trashed: 1 })
  })
})
