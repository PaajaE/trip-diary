import { describe, expect, it } from 'vitest'
import { dayElementId } from '@/features/journey-workspace/model/workspace-days'
import {
  boundsOf,
  buildBubbleModel,
  buildMapModel,
  computeFocus,
  computeView,
  createHoverStore,
  estimateMomentHeight,
  formatDayCaption,
  meanPosition,
  placeBubbles,
  viewportCandidates,
  type MapPin,
} from '@/features/journey-workspace/model/workspace-map'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'

const pin = (id: string, lng: number, lat: number): MapPin => ({
  id,
  label: id,
  latitude: lat,
  longitude: lng,
})

describe('boundsOf / computeView', () => {
  it('returns null for no coordinates', () => {
    expect(boundsOf([])).toBeNull()
    expect(computeView([], null)).toBeNull()
  })
  it('fits all pins, or only the requested ids', () => {
    const pins = [pin('a', 0, 0), pin('b', 10, 20), pin('c', -5, 5)]
    expect(computeView(pins, null)).toEqual({
      bounds: [
        [-5, 0],
        [10, 20],
      ],
      type: 'bounds',
    })
    expect(computeView(pins, ['a', 'c'])).toEqual({
      bounds: [
        [-5, 0],
        [0, 5],
      ],
      type: 'bounds',
    })
  })
  it('flies to a single pin at zoom >= 11, ignores ids without coordinates', () => {
    const view = computeView([pin('a', 3, 4), pin('b', 9, 9)], ['a', 'zzz'])
    expect(view).toEqual({ center: [3, 4], minZoom: 11, type: 'point' })
    expect(computeView([pin('a', 3, 4)], ['zzz'])).toBeNull()
  })
})

describe('computeFocus', () => {
  const pins = [pin('a', 0, 0), pin('b', 1, 1), pin('c', 2, 2), pin('d', 3, 3)]
  it('numbers and connects only the pins of the day, in time order', () => {
    const focus = computeFocus(pins, ['d', 'b', 'zzz'])
    expect([...focus.numbers]).toEqual([
      ['b', 1],
      ['d', 2],
    ])
    expect(focus.line).toEqual([
      [1, 1],
      [3, 3],
    ])
  })
  it('has no line for one point and nothing without a focused day', () => {
    expect(computeFocus(pins, ['c']).line).toBeNull()
    expect(computeFocus(pins, ['c']).numbers.get('c')).toBe(1)
    const none = computeFocus(pins, null)
    expect(none.line).toBeNull()
    expect(none.numbers.size).toBe(0)
  })
})

describe('formatDayCaption', () => {
  it('formats weekday, day and month per language', () => {
    expect(formatDayCaption('2026-06-03', 'cs')).toBe('St 3. 6.')
    expect(formatDayCaption('2026-06-03', 'en')).toBe('Wed 3 Jun')
    expect(formatDayCaption('unknown', 'en')).toBeNull()
  })
})

describe('buildMapModel', () => {
  const stage1 = seg(1, { startsAt: '2026-01-01T00:00:00Z' })
  const trip = seg(2, { kind: 'trip', parentId: stage1.id })
  const stage2 = seg(3, {
    endsAt: '2026-03-10T00:00:00Z',
    startsAt: '2026-03-01T00:00:00Z',
  })
  const moments = [
    mom(10, { latitude: 1, longitude: 1, startsAt: '2026-01-02T10:00:00Z' }),
    mom(11, { latitude: 2, longitude: 2, startsAt: '2026-01-03T10:00:00Z' }),
    mom(12, { latitude: 3, longitude: 3, startsAt: '2026-03-02T10:00:00Z' }),
    mom(13, { startsAt: '2026-03-03T10:00:00Z' }),
    mom(14, { latitude: 9, longitude: 9, startsAt: '2027-06-01T10:00:00Z' }),
  ]
  const tree = buildWorkspaceTree([stage1, trip, stage2], moments, [])
  const model = buildMapModel(tree, (entry) => entry.moment.id)

  it('keeps time order and drops moments without coordinates', () => {
    expect(model.pins.map((p) => p.id)).toEqual([
      uuid(10),
      uuid(11),
      uuid(12),
      uuid(14),
    ])
  })
  it('maps moments, days and stages to their day', () => {
    const day = dayElementId(stage2.id, '2026-03-02')
    expect(model.dayOfMoment.get(uuid(12))).toBe(day)
    expect(model.dayOfElement.get(`ws-moment-${uuid(12)}`)).toBe(day)
    expect(model.dayOfElement.get(`ws-segment-${stage2.id}`)).toBe(
      dayElementId(stage2.id, '2026-03-02'),
    )
    expect(model.days.get(day)).toEqual({
      key: '2026-03-02',
      momentIds: [uuid(12)],
    })
  })
  it('indexes scopes: segment (with nested), day and moment', () => {
    expect(model.scopes.get(`ws-segment-${stage1.id}`)).toEqual([
      uuid(10),
      uuid(11),
    ])
    expect(model.scopes.get(dayElementId(stage2.id, '2026-03-02'))).toEqual([
      uuid(12),
    ])
    expect(model.scopes.get(`ws-moment-${uuid(14)}`)).toEqual([uuid(14)])
  })
  it('lists the segments to open for a moment', () => {
    expect(model.expandFor.get(uuid(12))).toEqual([stage2.id])
    expect(model.expandFor.get(uuid(14))).toEqual([])
  })
})

describe('estimateMomentHeight / hover store', () => {
  it('grows with the tile rows', () => {
    expect(estimateMomentHeight(0, false)).toBeLessThan(
      estimateMomentHeight(3, false),
    )
    expect(estimateMomentHeight(3, false)).toBeLessThan(
      estimateMomentHeight(30, false),
    )
    expect(estimateMomentHeight(30, false)).toBe(estimateMomentHeight(6, false))
  })
  it('notifies only on change and can unsubscribe', () => {
    const store = createHoverStore()
    const seen: (string | null)[] = []
    const off = store.subscribe((id) => seen.push(id))
    store.set('a')
    store.set('a')
    store.set(null)
    off()
    store.set('b')
    expect(seen).toEqual(['a', null])
    expect(store.get()).toBe('b')
  })
})

describe('bubbles', () => {
  const variant = (id: string, kind: 'thumb' | 'large') => ({
    byteSize: 1,
    createdAt: '2026-01-01T00:00:00+00:00',
    height: 10,
    kind,
    mediaId: id,
    mimeType: 'image/webp' as const,
    storageKey: `k/${kind}.webp`,
    width: 10,
  })

  it('places a stage bubble at the mean of its moments with coordinates', () => {
    const cover = med(30, {
      momentId: uuid(10),
      variants: [variant(uuid(30), 'large'), variant(uuid(30), 'thumb')],
    })
    const tree = buildWorkspaceTree(
      [seg(1, { coverMediaId: cover.id, title: 'Alps' }), seg(2)],
      [
        mom(10, { latitude: 10, longitude: 20 }),
        mom(11, { latitude: 20, longitude: 40 }),
        mom(12, { latitude: null, longitude: null }),
      ],
      [cover],
    )
    const model = buildBubbleModel(tree, 'https://m.test')
    expect(model.stages).toEqual([
      {
        id: uuid(1),
        latitude: 15,
        longitude: 30,
        title: 'Alps',
        url: 'https://m.test/k/thumb.webp',
      },
    ])
    expect(model.moments.get(uuid(10))?.url).toBe('https://m.test/k/thumb.webp')
    expect(model.moments.has(uuid(11))).toBe(false)
  })

  it('meanPosition is null without coordinates', () => {
    expect(meanPosition([])).toBeNull()
  })

  it('selects pins in the viewport with a thumbnail, minus skipped', () => {
    const bubbles = new Map(
      ['a', 'b', 'c', 'd'].map((id) => [
        id,
        { photoCount: 1, starred: false, url: id },
      ]),
    )
    const pins = [
      pin('a', 1, 1),
      pin('b', 50, 1),
      pin('c', 2, 2),
      pin('x', 1, 1),
    ]
    const bounds = { east: 5, north: 5, south: 0, west: 0 }
    expect(
      viewportCandidates(pins, bounds, new Map([['c', 1]]), bubbles).map(
        (p) => p.id,
      ),
    ).toEqual(['a'])
  })

  it('places by priority and drops bubbles near placed ones', () => {
    const c = (id: string, x: number, photoCount: number, starred = false) => ({
      id,
      photoCount,
      starred,
      x,
      y: 0,
    })
    expect(
      placeBubbles(
        [{ x: 200, y: 0 }],
        [c('a', 30, 1), c('b', 20, 5), c('c', 40, 1, true), c('d', 190, 9)],
      ),
    ).toEqual(['c'])
    // Without the starred one the busier of two neighbours wins.
    expect(
      placeBubbles([], [c('a', 0, 1), c('b', 20, 5), c('e', 100, 1)]),
    ).toEqual(['b', 'e'])
  })
})
