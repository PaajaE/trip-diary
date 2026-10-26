import i18n from 'i18next'
import { describe, expect, it } from 'vitest'
import '@/app/i18n'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom } from '@/features/journey-workspace/test-fixtures'
import {
  buildMoveStops,
  moveSheetModel,
  nearestStopIndex,
  stopTimeText,
  type MoveSheetStop,
} from './move-sheet'

function stop(id: string, startsAt: string, endsAt: string): MoveSheetStop {
  return {
    cover: null,
    dayKey: '2026-01-02',
    dayLabel: '',
    endsAt,
    id,
    latitude: null,
    longitude: null,
    pending: false,
    photoCount: 0,
    placeName: null,
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
      currentId: null,
      newStopPlace: null,
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

describe('moveSheetModel with a placed photo and a new stop', () => {
  it('does not suggest the stop the photo is already in', () => {
    const placed = med(1, {
      capturedAt: '2026-01-02T12:30:00+00:00',
      momentId: 'b',
    })
    const model = moveSheetModel([A, B, C], placed)
    expect(model.currentId).toBe('b')
    expect(model.suggestedId).not.toBe('b')
  })
  it('names a new stop after the closest named stop within 500 m', () => {
    const near = {
      ...A,
      latitude: 51.1789,
      longitude: -115.5708,
      placeName: 'Banff',
    }
    const far = { ...B, latitude: 51.4, longitude: -115.5, placeName: 'Lake' }
    const photo = med(1, { latitude: 51.179, longitude: -115.571 })
    expect(moveSheetModel([far, near], photo).newStopPlace).toBe('Banff')
    expect(moveSheetModel([far], photo).newStopPlace).toBeNull()
    expect(
      moveSheetModel([near], med(2, { latitude: null, longitude: null }))
        .newStopPlace,
    ).toBeNull()
  })
})

describe('stopTimeText', () => {
  it('shows one time for a single shot and a range for a longer stop', () => {
    const start = '2026-01-02T14:07:00Z'
    const end = '2026-01-02T14:40:00Z'
    expect(stopTimeText(start, end, 'UTC', 'cs', 1)).toBe('14:07')
    expect(stopTimeText(start, end, 'UTC', 'cs', 4)).toBe('14:07 – 14:40')
    expect(stopTimeText(start, start, 'UTC', 'cs', 4)).toBe('14:07')
  })
})

describe('buildMoveStops', () => {
  const day1 = mom(1, {
    endsAt: '2026-01-02T10:00:00+00:00',
    latitude: 51,
    longitude: -115,
    placeId: 'p1',
    startsAt: '2026-01-02T10:00:00+00:00',
  })
  const day2 = mom(2, {
    endsAt: '2026-01-03T10:00:00+00:00',
    startsAt: '2026-01-03T10:00:00+00:00',
    title: 'Manual',
  })
  const bare = mom(3, {
    endsAt: '2026-01-03T12:00:00+00:00',
    startsAt: '2026-01-03T12:00:00+00:00',
  })
  const tree = buildWorkspaceTree(
    [],
    [day1, day2, bare],
    [
      med(10, { capturedAt: '2026-01-02T10:00:00+00:00', momentId: day1.id }),
      med(11, { capturedAt: '2026-01-03T10:00:00+00:00', momentId: day2.id }),
    ],
  )

  it('uses the place name, a lookup placeholder, then "Stop N"; never a made-up time title', async () => {
    await i18n.changeLanguage('cs')
    const t = i18n.t.bind(i18n)
    const unknown = buildMoveStops(tree, t, 'cs')
    expect(unknown[0]).toMatchObject({
      pending: true,
      title: 'Hledám místo…',
    })
    // One photo: a single time, never an interval.
    expect(unknown[0]?.when).not.toContain('–')
    const named = buildMoveStops(tree, t, 'cs', new Map([['p1', 'Banff']]))
    expect(named.map((s) => [s.title, s.pending])).toEqual([
      ['Banff', false],
      ['Manual', false],
      ['Zastávka 3', false],
    ])
    expect(named[0]?.placeName).toBe('Banff')
    expect(named[1]?.placeName).toBeNull()
    expect(named.some((s) => /\d{1,2}:\d{2}/.test(s.title))).toBe(false)
  })
  it('groups by day with a heading label per stop', () => {
    const t = i18n.t.bind(i18n)
    const stops = buildMoveStops(tree, t, 'cs', new Map(), 'UTC')
    expect(stops.map((s) => s.dayKey)).toEqual([
      '2026-01-02',
      '2026-01-03',
      '2026-01-03',
    ])
    expect(stops[0]?.dayLabel).toMatch(/2\. ledna/)
  })
})
