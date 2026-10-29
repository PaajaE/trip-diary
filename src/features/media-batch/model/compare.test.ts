import { describe, expect, it } from 'vitest'
import {
  nearestInTime,
  orderedCandidates,
  stepPartner,
} from '@/features/media-batch/model/compare'

const at = (id: string, capturedAt: string | null) => ({ capturedAt, id })
const main = at('m', '2026-01-02T09:00:10+00:00')
const early = at('e', '2026-01-02T09:00:00+00:00')
const near = at('n', '2026-01-02T09:00:12+00:00')
const late = at('l', '2026-01-02T09:05:00+00:00')
const undated = at('u', null)

describe('orderedCandidates', () => {
  it('drops the main photo and sorts by capture time, undated last', () => {
    expect(
      orderedCandidates(main, [late, undated, main, early, near]).map(
        (x) => x.id,
      ),
    ).toEqual(['e', 'n', 'l', 'u'])
  })
})

describe('nearestInTime', () => {
  it('picks the closest photo in time, before or after', () => {
    expect(nearestInTime(main, [early, near, late])).toBe(near)
    expect(nearestInTime(main, [early, late])).toBe(early)
  })

  it('ties go to the earlier photo; undated photos only as a last resort', () => {
    const before = at('b', '2026-01-02T09:00:08+00:00')
    const after = at('a', '2026-01-02T09:00:12+00:00')
    expect(nearestInTime(main, [before, after])).toBe(before)
    expect(nearestInTime(main, [undated, late])).toBe(late)
    expect(nearestInTime(main, [undated])).toBe(undated)
    const none: (typeof early)[] = []
    expect(nearestInTime(main, none)).toBeUndefined()
  })

  it('an undated main photo gets the first candidate', () => {
    expect(nearestInTime(undated, [early, late])).toBe(early)
  })
})

describe('stepPartner', () => {
  const list = [early, near, late]
  it('steps and wraps in both directions', () => {
    expect(stepPartner(list, 'n', 1)).toBe(late)
    expect(stepPartner(list, 'l', 1)).toBe(early)
    expect(stepPartner(list, 'e', -1)).toBe(late)
  })

  it('starts at an end when the current partner is unknown', () => {
    expect(stepPartner(list, undefined, 1)).toBe(early)
    expect(stepPartner(list, undefined, -1)).toBe(late)
    const none: (typeof early)[] = []
    expect(stepPartner(none, 'x', 1)).toBeUndefined()
  })
})
