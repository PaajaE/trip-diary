import { describe, expect, it } from 'vitest'
import { dayElementId } from '@/features/journey-workspace/model/workspace-days'
import {
  boundsOf,
  buildMapModel,
  buildRoutes,
  computeView,
  createHoverStore,
  estimateMomentHeight,
  NEUTRAL_COLOR,
  STAGE_PALETTE,
  stageColor,
  type MapPin,
} from '@/features/journey-workspace/model/workspace-map'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'

const pin = (id: string, lng: number, lat: number, color = 'a'): MapPin => ({
  color,
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

describe('buildRoutes', () => {
  it('chains runs of one colour and links runs together', () => {
    const lines = buildRoutes([
      pin('a', 0, 0, 'red'),
      pin('b', 1, 1, 'red'),
      pin('c', 2, 2, 'blue'),
      pin('d', 3, 3, 'blue'),
    ])
    expect(lines).toEqual([
      {
        color: 'red',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      {
        color: 'blue',
        coordinates: [
          [1, 1],
          [2, 2],
          [3, 3],
        ],
      },
    ])
  })
  it('has no line for fewer than two pins', () => {
    expect(buildRoutes([pin('a', 0, 0)])).toEqual([])
  })
})

describe('stageColor', () => {
  it('is stable and wraps around the palette', () => {
    expect(stageColor(0)).toBe(STAGE_PALETTE[0])
    expect(stageColor(STAGE_PALETTE.length)).toBe(STAGE_PALETTE[0])
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

  it('keeps time order, colours by stage, neutral for loose moments', () => {
    expect(model.pins.map((p) => p.id)).toEqual([
      uuid(10),
      uuid(11),
      uuid(12),
      uuid(14),
    ])
    expect(model.pins.map((p) => p.color)).toEqual([
      stageColor(0),
      stageColor(0),
      stageColor(1),
      NEUTRAL_COLOR,
    ])
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
