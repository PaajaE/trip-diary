import { describe, expect, it } from 'vitest'
import type { MediaQuality } from './quality.ts'
import { clusterSeries, recommendBest } from './series.ts'

const T = (s: number) => new Date(Date.UTC(2026, 5, 1, 10, 0, s)).toISOString()

describe('clusterSeries', () => {
  it('groups similar close shots and ignores singletons', () => {
    const groups = clusterSeries([
      { capturedAt: T(0), id: 'a', phash: 100 },
      { capturedAt: T(5), id: 'b', phash: 101 },
      { capturedAt: T(10), id: 'c', phash: 103 },
      { capturedAt: T(12), id: 'd', phash: 2 ** 48 - 1 },
      { capturedAt: T(500), id: 'e', phash: 100 },
    ])
    expect(groups).toEqual([['a', 'b', 'c']])
  })

  it('splits on time gap and respects options', () => {
    const items = [
      { capturedAt: T(0), id: 'a', phash: 5 },
      { capturedAt: T(100), id: 'b', phash: 5 },
    ]
    expect(clusterSeries(items)).toEqual([])
    expect(clusterSeries(items, { maxGapMs: 100_000 })).toEqual([['a', 'b']])
    const far = [
      { capturedAt: T(0), id: 'a', phash: 0 },
      { capturedAt: T(1), id: 'b', phash: 2 ** 12 - 1 },
    ]
    expect(clusterSeries(far)).toEqual([])
    expect(clusterSeries(far, { maxHamming: 12 })).toEqual([['a', 'b']])
  })

  it('never groups items with null time or hash', () => {
    expect(
      clusterSeries([
        { capturedAt: null, id: 'a', phash: 1 },
        { capturedAt: null, id: 'b', phash: 1 },
        { capturedAt: T(0), id: 'c', phash: null },
        { capturedAt: T(1), id: 'd', phash: null },
      ]),
    ).toEqual([])
  })

  it('is independent of input order, orders groups by time, ties by id', () => {
    const items = [
      { capturedAt: T(0), id: 'z', phash: 1 },
      { capturedAt: T(0), id: 'y', phash: 1 },
      { capturedAt: T(1000), id: 'm', phash: 9 },
      { capturedAt: T(1010), id: 'n', phash: 9 },
    ]
    const expected = [
      ['y', 'z'],
      ['m', 'n'],
    ]
    expect(clusterSeries(items)).toEqual(expected)
    expect(clusterSeries([...items].reverse())).toEqual(expected)
    expect(clusterSeries([])).toEqual([])
  })
})

function q(sharp: number, extra: Partial<MediaQuality> = {}): MediaQuality {
  return { sharp, v: 1, ...extra }
}
function c(
  id: string,
  quality: MediaQuality | null,
  extra: { starred?: boolean; capturedAt?: string | null } = {},
) {
  return {
    capturedAt: extra.capturedAt === undefined ? T(0) : extra.capturedAt,
    id,
    quality,
    starred: extra.starred ?? false,
  }
}

describe('recommendBest', () => {
  it('returns null for an empty list', () => {
    expect(recommendBest([])).toBeNull()
  })

  it('picks the sharpest', () => {
    const r = recommendBest([c('a', q(10)), c('b', q(50)), c('c', q(30))])
    expect(r).toEqual({ id: 'b', reasons: ['sharpest'] })
  })

  it('penalises closed eyes hard', () => {
    const r = recommendBest([
      c('a', q(100, { eyesClosed: true })),
      c('b', q(40, { eyesClosed: false })),
    ])
    expect(r).toEqual({ id: 'b', reasons: ['eyesOpen'] })
  })

  it('penalises bad exposure mildly', () => {
    expect(
      recommendBest([
        c('a', q(100, { exposure: 0.98 })),
        c('b', q(90, { exposure: 0.5 })),
      ])?.id,
    ).toBe('b')
    // clearly sharper still wins despite poor exposure
    expect(
      recommendBest([
        c('a', q(100, { exposure: 0.98 })),
        c('b', q(40, { exposure: 0.5 })),
      ])?.id,
    ).toBe('a')
    const good = recommendBest([
      c('a', q(100, { exposure: 0.05 })),
      c('b', q(100, { exposure: 0.5 })),
    ])
    expect(good).toEqual({ id: 'b', reasons: ['sharpest', 'goodExposure'] })
  })

  it('star wins only when sharpness is not clearly worse', () => {
    expect(
      recommendBest([c('a', q(100)), c('b', q(90), { starred: true })]),
    ).toEqual({ id: 'b', reasons: ['starred'] })
    expect(
      recommendBest([c('a', q(100)), c('b', q(70), { starred: true })])?.id,
    ).toBe('a')
  })

  it('ranks candidates without quality last', () => {
    expect(
      recommendBest([c('a', null, { starred: true }), c('b', q(1))])?.id,
    ).toBe('b')
    expect(recommendBest([c('a', null), c('b', null)])?.id).toBe('a')
  })

  it('handles an all-zero sharpness series', () => {
    expect(recommendBest([c('b', q(0)), c('a', q(0))])?.id).toBe('a')
  })

  it('breaks ties by earliest capturedAt, then id, regardless of order', () => {
    const early = c('z', q(10), { capturedAt: T(0) })
    const late = c('a', q(10), { capturedAt: T(5) })
    expect(recommendBest([late, early])?.id).toBe('z')
    expect(recommendBest([early, late])?.id).toBe('z')
    const nulls = [
      c('b', q(10), { capturedAt: null }),
      c('a', q(10), { capturedAt: null }),
    ]
    expect(recommendBest(nulls)?.id).toBe('a')
    expect(recommendBest([...nulls].reverse())?.id).toBe('a')
  })

  it('a single candidate has no reasons', () => {
    expect(recommendBest([c('a', q(5), { starred: true })])).toEqual({
      id: 'a',
      reasons: [],
    })
  })
})
