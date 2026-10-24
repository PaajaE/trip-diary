import { describe, expect, it } from 'vitest'
import { med } from '@/features/journey-workspace/test-fixtures'
import {
  moveSheetModel,
  nearestStopIndex,
  type MoveSheetStop,
} from './move-sheet'

function stop(id: string, startsAt: string, endsAt: string): MoveSheetStop {
  return {
    cover: null,
    endsAt,
    id,
    latitude: null,
    longitude: null,
    photoCount: 0,
    startsAt,
    title: id,
    videoCount: 0,
    when: '',
  }
}

const A = stop('a', '2026-01-02T08:00:00Z', '2026-01-02T09:00:00Z')
const B = stop('b', '2026-01-02T12:00:00Z', '2026-01-02T13:00:00Z')
const C = stop('c', '2026-01-03T12:00:00Z', '2026-01-03T13:00:00Z')

describe('nearestStopIndex', () => {
  it('prefers the stop containing the instant, else the closest edge', () => {
    expect(nearestStopIndex([A, B, C], '2026-01-02T12:30:00Z')).toBe(1)
    expect(nearestStopIndex([A, B, C], '2026-01-02T09:30:00Z')).toBe(0)
    expect(nearestStopIndex([A, B, C], '2026-01-02T11:00:00Z')).toBe(1)
  })
  it('is null without a usable time or stops', () => {
    expect(nearestStopIndex([A], null)).toBeNull()
    expect(nearestStopIndex([A], 'nonsense')).toBeNull()
    expect(nearestStopIndex([], '2026-01-02T09:30:00Z')).toBeNull()
  })
})

describe('moveSheetModel', () => {
  it('gives previous / next around the nearest stop and the suggestion', () => {
    const first = med(1, { capturedAt: '2026-01-02T12:30:00+00:00' })
    expect(moveSheetModel([A, B, C], first)).toEqual({
      nextId: 'c',
      prevId: 'a',
      suggestedId: 'b',
      unavailable: null,
    })
  })
  it('has no previous before the first and no next after the last stop', () => {
    const early = med(1, { capturedAt: '2026-01-02T07:00:00+00:00' })
    expect(moveSheetModel([A, B], early).prevId).toBeNull()
    const late = med(2, { capturedAt: '2026-01-05T07:00:00+00:00' })
    expect(moveSheetModel([A, B], late).nextId).toBeNull()
  })
  it('explains why it cannot navigate', () => {
    expect(moveSheetModel([], med(1)).unavailable).toBe('noStops')
    expect(moveSheetModel([A], med(1, { capturedAt: null })).unavailable).toBe(
      'noTime',
    )
  })
})
