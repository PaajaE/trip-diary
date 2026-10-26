import { describe, expect, it } from 'vitest'
import { med } from '@/features/journey-workspace/test-fixtures'
import {
  advanceOpen,
  buildSession,
  comparePool,
  dayIsDone,
  dropAction,
  handledMap,
  lastSortedDay,
  nextDayStart,
  openSeries,
  popAction,
  pushAction,
  settleAction,
  skipTarget,
  stepOpen,
  summarize,
  undoable,
  type SortAction,
  type SortHistory,
} from '@/features/media-batch/model/quick-sort'

const act = (
  seq: number,
  type: SortAction['type'],
  ids: string[],
  extra: Partial<SortAction> = {},
): SortAction => ({ ids, seq, type, ...extra })

// Day 1: a(1) b(2) c(3); day 2: d(4). 1 and 2 look alike (series).
const a = med(1, { capturedAt: '2026-01-02T09:00:00+00:00', phash: 0b1010 })
const b = med(2, { capturedAt: '2026-01-02T09:00:10+00:00', phash: 0b1011 })
const c = med(3, { capturedAt: '2026-01-02T12:00:00+00:00', phash: 1 << 30 })
const d = med(4, { capturedAt: '2026-01-03T09:00:00+00:00' })

describe('buildSession', () => {
  it('orders in reading order and is independent of input order', () => {
    const session = buildSession([d, c, b, a])
    expect(session.ids).toEqual([a.id, b.id, c.id, d.id])
    expect(session.days.map((day) => day.ids.length)).toEqual([3, 1])
    expect(session.dayOf.get(d.id)).toBe('2026-01-03')
  })

  it('groups similar photos into a series', () => {
    const session = buildSession([a, b, c, d])
    expect(session.series).toEqual([[a.id, b.id]])
    expect(session.seriesOf.get(a.id)).toEqual([a.id, b.id])
    expect(session.seriesOf.has(c.id)).toBe(false)
  })

  it('makes no series without phash', () => {
    const plain = [med(1), med(2, { capturedAt: '2026-01-02T10:00:05+00:00' })]
    expect(buildSession(plain).series).toEqual([])
  })

  it('is a snapshot: later changes of the input do not affect it', () => {
    const live = [a, b]
    const session = buildSession(live)
    live.pop()
    expect(session.ids).toHaveLength(2)
  })
})

describe('history', () => {
  it('derives handled outcomes and the last step wins', () => {
    const history: SortHistory = [
      act(1, 'trash', [a.id]),
      act(2, 'moveTo', [b.id], { momentId: 'm' }),
      act(3, 'done', [c.id]),
      act(4, 'star', [d.id]),
    ]
    const map = handledMap(history)
    expect(map.get(a.id)).toBe('trash')
    expect(map.get(b.id)).toBe('stop')
    expect(map.get(c.id)).toBe('done')
    expect(map.has(d.id)).toBe(false)
  })

  it('undo stack: pop returns to the earlier state, pending blocks undo', () => {
    let history: SortHistory = []
    history = pushAction(history, act(1, 'trash', [a.id], { pending: true }))
    expect(undoable(history)).toBeNull()
    history = settleAction(history, 1)
    expect(undoable(history)?.seq).toBe(1)
    history = pushAction(history, act(2, 'done', [b.id]))
    expect(handledMap(history).size).toBe(2)
    history = popAction(history)
    expect([...handledMap(history).keys()]).toEqual([a.id])
    expect(dropAction(history, 1)).toEqual([])
  })

  it('settleAction records the created stop and clears pending', () => {
    const history = settleAction(
      [act(1, 'newStop', [a.id], { pending: true })],
      1,
      { createdMomentId: 'new' },
    )
    expect(history[0]).toEqual({
      createdMomentId: 'new',
      ids: [a.id],
      seq: 1,
      type: 'newStop',
    })
  })
})

describe('navigation over open items', () => {
  const ids = ['a', 'b', 'c', 'd']
  const handled = handledMap([act(1, 'trash', ['b']), act(2, 'done', ['d'])])
  it('skips handled items', () => {
    expect(stepOpen(ids, handled, 0, 1)).toBe(2)
    expect(stepOpen(ids, handled, 2, -1)).toBe(0)
    expect(stepOpen(ids, handled, 2, 1)).toBeNull()
  })
  it('advances forward, then back, then null', () => {
    expect(advanceOpen(ids, handled, 0)).toBe(2)
    expect(advanceOpen(ids, handled, 2)).toBe(0)
    expect(
      advanceOpen(ids, handledMap([act(1, 'done', ['a', 'b', 'c', 'd'])]), 1),
    ).toBeNull()
  })
  it('skip wraps to the first open item', () => {
    expect(skipTarget(ids, handled, 2)).toBe(0)
    expect(skipTarget(['a'], new Map(), 0)).toBeNull()
  })
})

describe('series membership', () => {
  it('shrinks as members are handled', () => {
    const session = buildSession([a, b, c])
    expect(openSeries(session, a.id, new Map())).toEqual([a.id, b.id])
    const handled = handledMap([act(1, 'trash', [b.id])])
    expect(openSeries(session, a.id, handled)).toEqual([a.id])
    expect(openSeries(session, c.id, new Map())).toEqual([])
  })
})

describe('summary', () => {
  it('counts what stands: stars (not of trashed), trash, stops, done', () => {
    const history: SortHistory = [
      act(1, 'star', [a.id]),
      act(2, 'star', [b.id]),
      act(3, 'unstar', [b.id]),
      act(4, 'moveTo', [a.id], { momentId: 'm' }),
      act(5, 'trash', [c.id]),
      act(6, 'star', [c.id]),
      act(7, 'newStop', [d.id]),
    ]
    expect(summarize(history)).toEqual({
      done: 0,
      starred: 1,
      toStops: 2,
      trashed: 1,
    })
    expect(summarize(popAction(history))).toMatchObject({ toStops: 1 })
  })

  it('knows the last sorted day, the next day and whether the day is done', () => {
    const session = buildSession([a, b, c, d])
    const history: SortHistory = [
      act(1, 'trash', [a.id]),
      act(2, 'done', [b.id, c.id]),
    ]
    const handled = handledMap(history)
    expect(lastSortedDay(session, history)).toBe('2026-01-02')
    expect(dayIsDone(session, handled, '2026-01-02')).toBe(true)
    expect(nextDayStart(session, handled, '2026-01-02')).toBe(d.id)
    expect(
      nextDayStart(
        session,
        handledMap([...history, act(3, 'done', [d.id])]),
        '2026-01-02',
      ),
    ).toBeNull()
  })

  it('has no day for undated items', () => {
    const u = med(9, { capturedAt: null, capturedTz: null })
    const session = buildSession([u])
    expect(lastSortedDay(session, [act(1, 'done', [u.id])])).toBeNull()
  })
})

describe('comparePool', () => {
  const session = buildSession([a, b, c, d])

  it('uses the series, without the photo itself', () => {
    expect(comparePool(session, a.id, new Map())).toEqual([b.id])
  })

  it('never offers a trashed photo', () => {
    expect(comparePool(session, a.id, new Map([[b.id, 'trash']]))).toEqual([])
    expect(comparePool(session, a.id, new Map([[b.id, 'done']]))).toEqual([
      b.id,
    ])
  })

  it('without a series takes neighbours of the same day only', () => {
    expect(comparePool(session, c.id, new Map())).toEqual([a.id, b.id])
    expect(comparePool(session, d.id, new Map())).toEqual([])
    expect(comparePool(session, 'unknown', new Map())).toEqual([])
  })
})
