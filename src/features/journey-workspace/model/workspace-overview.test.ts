import { describe, expect, it } from 'vitest'
import {
  med,
  mom,
  seg,
  uuid,
  variant,
} from '@/features/journey-workspace/test-fixtures'
import {
  buildOverview,
  dayStopNames,
  pickMosaic,
} from '@/features/journey-workspace/model/workspace-overview'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'

const T = (day: string, hhmm = '10:00') => `2026-01-${day}T${hhmm}:00+00:00`

/** A ready photo with a thumbnail in the given moment. */
function photo(n: number, momentId: string, over = {}) {
  const base = med(n)
  return med(n, {
    capturedAt: T('02'),
    momentId,
    variants: [variant(base.id, 'thumb')],
    ...over,
  })
}

const none = () => undefined

describe('pickMosaic', () => {
  it('uses the first starred photo as hero, even from a small stop', () => {
    const big = mom(10, { startsAt: T('02', '09:00') })
    const small = mom(11, { startsAt: T('02', '12:00') })
    const media = [
      photo(20, big.id),
      photo(21, big.id),
      photo(22, big.id),
      photo(23, small.id, { starred: true }),
    ]
    const tree = buildWorkspaceTree([], [big, small], media)
    const entries = tree.looseMoments
    const mosaic = pickMosaic(entries)
    expect(mosaic[0]?.id).toBe(uuid(23))
    expect(mosaic).toHaveLength(3)
    expect(new Set(mosaic.map((m) => m.id)).size).toBe(3)
  })

  it('without a star prefers the chapter cover when it is on the day', () => {
    const a = mom(10, { startsAt: T('02', '09:00') })
    const b = mom(11, { startsAt: T('02', '12:00') })
    const media = [photo(20, a.id), photo(21, a.id), photo(22, b.id)]
    const entries = buildWorkspaceTree([], [a, b], media).looseMoments
    expect(pickMosaic(entries, uuid(22))[0]?.id).toBe(uuid(22))
    // A cover from another day is ignored: the biggest stop's cover leads.
    expect(pickMosaic(entries, uuid(999))[0]?.id).toBe(uuid(20))
  })

  it('takes the other two from different stops, biggest first', () => {
    const a = mom(10, { startsAt: T('02', '09:00') })
    const b = mom(11, { startsAt: T('02', '12:00') })
    const c = mom(12, { startsAt: T('02', '15:00') })
    const media = [
      photo(20, a.id),
      photo(21, a.id),
      photo(22, a.id),
      photo(23, b.id),
      photo(24, c.id),
      photo(25, c.id),
    ]
    const entries = buildWorkspaceTree([], [a, b, c], media).looseMoments
    expect(pickMosaic(entries).map((m) => m.momentId)).toEqual([
      a.id,
      c.id,
      b.id,
    ])
  })

  it('fills from the same stop when the day has one, and skips media without images', () => {
    const a = mom(10)
    const media = [
      photo(20, a.id),
      photo(21, a.id),
      photo(22, a.id),
      med(23, { momentId: a.id }),
    ]
    const entries = buildWorkspaceTree([], [a], media).looseMoments
    const mosaic = pickMosaic(entries)
    expect(mosaic.map((m) => m.id)).toEqual([uuid(20), uuid(21), uuid(22)])
    expect(pickMosaic([])).toEqual([])
  })
})

describe('dayStopNames', () => {
  it('lists distinct stop names in time order: title, else place name', () => {
    const moments = [
      mom(10, { placeId: 'p1', startsAt: T('02', '08:00') }),
      mom(11, { startsAt: T('02', '09:00'), title: 'Lake Louise' }),
      mom(12, { placeId: 'p1', startsAt: T('02', '10:00') }),
      mom(13, { placeId: 'p2', startsAt: T('02', '11:00') }),
      mom(14, { startsAt: T('02', '12:00'), title: 'lake louise' }),
      mom(15, { startsAt: T('02', '13:00') }),
    ]
    const entries = buildWorkspaceTree([], moments, []).looseMoments
    const names: Record<string, string> = { p1: 'Banff', p2: ' Field ' }
    expect(dayStopNames(entries, (id) => names[id])).toEqual([
      'Banff',
      'Lake Louise',
      'Field',
    ])
    expect(dayStopNames(entries, (id) => names[id], 2)).toEqual([
      'Banff',
      'Lake Louise',
    ])
    expect(dayStopNames(entries, none)).toEqual(['Lake Louise'])
  })
})

describe('buildOverview', () => {
  it('uses the photo day zones (SQL day rule), not only the fallback zone', () => {
    // 16:00Z is 17:00 on 4 Jan in Prague but 05:00 on 5 Jan in Auckland,
    // where the photos of that day were taken.
    const stop = mom(30, {
      latitude: 1,
      longitude: 1,
      startsAt: T('04', '16:00'),
      endsAt: T('04', '16:30'),
    })
    const other = mom(31, {
      startsAt: T('04', '17:00'),
      endsAt: T('04', '18:00'),
    })
    const tree = buildWorkspaceTree(
      [],
      [stop, other],
      [
        photo(32, other.id, {
          capturedAt: T('04', '17:00'),
          capturedTz: 'Pacific/Auckland',
        }),
      ],
    )
    const overview = buildOverview(tree, none, 'Europe/Prague')
    expect(overview.dayOfMoment.get(stop.id)).toBe('2026-01-05')
    expect(overview.firstDay).toBe('2026-01-05')
  })

  function journey() {
    const alpha = seg(1, {
      endsAt: T('05', '00:00'),
      startsAt: T('01', '00:00'),
      title: 'Alpha',
    })
    const beta = seg(2, {
      body: 'About Beta',
      endsAt: T('09', '00:00'),
      startsAt: T('05', '12:00'),
      title: 'Beta',
    })
    const moments = [
      mom(10, { body: 'Nice day', startsAt: T('02') }),
      mom(11, { startsAt: T('03') }),
      // Between the stages: loose.
      mom(12, { startsAt: T('05', '06:00') }),
      mom(13, { startsAt: T('06') }),
      mom(14, { startsAt: T('07') }),
    ]
    const media = [
      photo(20, moments[0]?.id ?? '', { capturedAt: T('02') }),
      photo(21, moments[1]?.id ?? '', { capturedAt: T('03') }),
    ]
    return buildWorkspaceTree([alpha, beta], moments, media)
  }

  it('orders chapters by time with loose runs between the stages', () => {
    const overview = buildOverview(journey(), none, 'Europe/Prague')
    expect(overview.chapters.map((c) => c.kind)).toEqual([
      'stage',
      'loose',
      'stage',
    ])
    expect(overview.chapters.map((c) => c.days.map((d) => d.key))).toEqual([
      ['2026-01-02', '2026-01-03'],
      ['2026-01-05'],
      ['2026-01-06', '2026-01-07'],
    ])
    expect(overview.days).toHaveLength(5)
    expect(overview.firstDay).toBe('2026-01-02')
    expect(overview.chapters[0]?.days[1]?.number).toBe(2)
  })

  it('marks a day written when a stop or its stage has text, and derives progress', () => {
    const overview = buildOverview(journey(), none, 'Europe/Prague')
    const [alpha, loose, beta] = overview.chapters
    expect(alpha?.days.map((d) => d.hasText)).toEqual([true, false])
    expect(alpha?.progress).toBe(0.5)
    expect(loose?.progress).toBe(0)
    // Beta's own text covers every day of the stage.
    expect(beta?.days.every((d) => d.hasText)).toBe(true)
    expect(beta?.progress).toBe(1)
  })

  it('draws the strip with loose days flagged and indexes moments by day', () => {
    const tree = journey()
    const overview = buildOverview(tree, none, 'Europe/Prague')
    expect(overview.strip.map((d) => d.loose)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ])
    expect(overview.dayOfMoment.get(uuid(13))).toBe('2026-01-06')
    expect(overview.chapterOfDay.get('2026-01-05')).toBe('loose-1')
  })

  it('puts photo count, places and mosaic on the card', () => {
    const tree = journey()
    const overview = buildOverview(
      tree,
      (id) => (id === 'p' ? 'Banff' : undefined),
      'Europe/Prague',
    )
    const card = overview.chapters[0]?.days[0]
    expect(card?.photoCount).toBe(1)
    expect(card?.mosaic.map((m) => m.id)).toEqual([uuid(20)])
    expect(card?.momentIds).toEqual([uuid(10)])
  })
})
