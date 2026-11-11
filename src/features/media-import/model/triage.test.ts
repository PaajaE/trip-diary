import { describe, expect, it } from 'vitest'
import {
  triageItemId,
  type TriageItem,
  type TriageStatus,
} from '@/entities/media/model/triage-item'
import {
  decide,
  dayKey,
  isInScope,
  estimateBytes,
  estimateMinutes,
  filterItems,
  formatBytes,
  formatMinutes,
  groupByDay,
  itemDayKey,
  itemZone,
  latestSelectionId,
  nextUndecided,
  reconcileRead,
  relativeSharpness,
  seriesAround,
  summarizeOverview,
  toCandidate,
  triageCounts,
} from '@/features/media-import/model/triage'
import { localDay, timeZoneAt } from '@trip-diary/core/automation'
import type { ImportCandidate } from '@/features/media-import/model/types'

const TZ = 'America/Edmonton'

function item(
  n: number,
  status: TriageStatus = 'found',
  extra: Partial<TriageItem> = {},
): TriageItem {
  return {
    bestPending: false,
    burstId: null,
    byteSize: null,
    capturedAt: new Date(Date.UTC(2026, 7, 4, 18, 0, n)).toISOString(),
    durationMs: null,
    icloudOnly: false,
    id: triageItemId('j', 'photokit', `a${String(n)}`),
    journeyId: 'j',
    latitude: 51.1,
    longitude: -115.5,
    mediaType: 'photo',
    ownerId: 'o',
    place: null,
    selectionId: 's1',
    sourceId: `a${String(n)}`,
    sourceKind: 'photokit',
    status,
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...extra,
  }
}

describe('counts and filters', () => {
  const items = [
    item(1, 'found'),
    item(2, 'kept'),
    item(3, 'starred'),
    item(4, 'dismissed'),
    item(5, 'uploaded'),
  ]
  it('counts per state; selected = kept + starred; uploaded is hidden', () => {
    expect(triageCounts(items)).toEqual({
      dismissed: 1,
      found: 1,
      kept: 1,
      selected: 2,
      starred: 1,
      total: 4,
    })
  })
  it('filters by state', () => {
    expect(filterItems(items, 'all')).toHaveLength(4)
    expect(filterItems(items, 'dismissed').map((i) => i.sourceId)).toEqual([
      'a4',
    ])
    expect(filterItems(items, 'kept')).toHaveLength(1)
  })
})

describe('days', () => {
  it('uses core localDay (04:00 start) in the given zone', () => {
    // 2026-08-05T03:30Z is 21:30 on Aug 4 in Edmonton, 05:30 on Aug 5 in Prague.
    expect(dayKey('2026-08-05T03:30:00.000Z', 'America/Edmonton')).toBe(
      '2026-08-04',
    )
    expect(dayKey('2026-08-05T03:30:00.000Z', 'Europe/Prague')).toBe(
      '2026-08-05',
    )
    // 02:00 local still belongs to the previous journey day.
    expect(dayKey('2026-08-05T08:00:00.000Z', 'America/Edmonton')).toBe(
      '2026-08-04',
    )
    expect(dayKey(null, TZ)).toBe('unknown')
  })

  it("groups by the photo's own zone, not the device zone", () => {
    // Late evening in Banff (GPS): Aug 4 21:30 local. A device in Prague would
    // put it on Aug 5; the map and the journey put it on Aug 4.
    const banff = item(1, 'found', {
      capturedAt: '2026-08-05T03:30:00.000Z',
      latitude: 51.18,
      longitude: -115.57,
    })
    const [day] = groupByDay([banff], 'Europe/Prague')
    expect(day?.key).toBe('2026-08-04')
    expect(day?.deviceZoneCount).toBe(0)
    expect(itemDayKey(banff, 'Europe/Prague')).toBe(
      localDay(
        Date.parse('2026-08-05T03:30:00.000Z'),
        timeZoneAt(51.18, -115.57),
      ),
    )
    expect(itemZone(banff, 'Europe/Prague')).toEqual({
      fallback: false,
      timeZone: 'America/Edmonton',
    })
  })

  it('falls back to the device zone only without a position and marks it', () => {
    const nowhere = item(2, 'found', {
      capturedAt: '2026-08-05T03:30:00.000Z',
      latitude: null,
      longitude: null,
    })
    expect(itemZone(nowhere, 'Europe/Prague')).toEqual({
      fallback: true,
      timeZone: 'Europe/Prague',
    })
    const [day] = groupByDay([nowhere], 'Europe/Prague')
    expect(day?.key).toBe('2026-08-05')
    expect(day?.deviceZoneCount).toBe(1)
  })

  it('groups oldest day first, unknown last, counts what remains', () => {
    const days = groupByDay(
      [
        item(1, 'kept', { capturedAt: null }),
        item(2, 'found', { capturedAt: '2026-08-06T18:00:00.000Z' }),
        item(3, 'found', { capturedAt: '2026-08-04T18:00:00.000Z' }),
        item(4, 'kept', { capturedAt: '2026-08-04T17:00:00.000Z' }),
      ],
      TZ,
    )
    expect(days.map((d) => d.key)).toEqual([
      '2026-08-04',
      '2026-08-06',
      'unknown',
    ])
    expect(days[0]?.items.map((i) => i.sourceId)).toEqual(['a4', 'a3'])
    expect(days[0]?.remaining).toBe(1)
  })
})

describe('decisions', () => {
  it('changes only given ids, skips uploaded and no-ops', () => {
    const items = [item(1), item(2, 'kept'), item(3, 'uploaded')]
    const ids = new Set(items.map((i) => i.id))
    const changed = decide(items, ids, 'keep', 'now')
    expect(changed.map((i) => i.sourceId)).toEqual(['a1'])
    expect(changed[0]?.status).toBe('kept')
    expect(decide(items, ids, 'best', 'now').map((i) => i.status)).toEqual([
      'starred',
      'starred',
    ])
  })
  it('away is dismissed and restore returns to found', () => {
    const [one] = decide([item(1)], new Set([item(1).id]), 'away', 'now')
    expect(one?.status).toBe('dismissed')
    const [back] = decide([one!], new Set([item(1).id]), 'restore', 'now')
    expect(back?.status).toBe('found')
  })
  it('finds the next undecided item and wraps', () => {
    const items = [item(1), item(2, 'kept'), item(3), item(4, 'kept')]
    expect(nextUndecided(items, null)?.sourceId).toBe('a1')
    expect(nextUndecided(items, items[0]?.id ?? '')?.sourceId).toBe('a3')
    expect(nextUndecided(items, items[2]?.id ?? '')?.sourceId).toBe('a1')
    expect(nextUndecided([item(1, 'kept')], null)).toBeNull()
  })
})

describe('reconcileRead', () => {
  const ctx = {
    journeyId: 'j',
    now: '2026-11-10T00:00:00.000Z',
    ownerId: 'o',
    selectionId: 's2',
    sourceKind: 'photokit' as const,
  }
  const cand = (
    id: string,
    extra: Partial<ImportCandidate> = {},
  ): ImportCandidate => ({
    capturedAt: '2026-08-04T18:00:00.000Z',
    durationMs: null,
    latitude: null,
    longitude: null,
    mediaType: 'photo',
    sourceId: id,
    ...extra,
  })
  it('adds new items as found and keeps decisions of known ones', () => {
    const result = reconcileRead(
      [item(1, 'kept', { selectionId: 's1' })],
      [cand('a1'), cand('a9')],
      ctx,
    )
    const byId = new Map(result.items.map((i) => [i.sourceId, i]))
    expect(byId.get('a1')?.status).toBe('kept')
    expect(byId.get('a1')?.selectionId).toBe('s2')
    expect(byId.get('a9')?.status).toBe('found')
  })
  it('never re-offers dismissed or uploaded items', () => {
    const result = reconcileRead(
      [item(1, 'dismissed'), item(2, 'uploaded')],
      [cand('a1'), cand('a2')],
      ctx,
    )
    expect(result.items).toEqual([])
    expect(result.dismissedBefore).toBe(1)
  })
  it('drops candidates that can never be imported', () => {
    const result = reconcileRead(
      [],
      [cand('v1', { skipReason: 'video_too_long' })],
      ctx,
    )
    expect(result).toEqual({ dismissedBefore: 0, items: [], skipped: 1 })
  })
  it('round-trips to an upload candidate and finds the latest selection', () => {
    expect(toCandidate(item(1)).sourceId).toBe('a1')
    expect(
      latestSelectionId([
        item(1, 'found', { selectionId: 's1' }),
        item(2, 'found', { selectionId: 's3' }),
      ]),
    ).toBe('s3')
    expect(latestSelectionId([])).toBeNull()
  })
})

describe('overview and estimates', () => {
  it('summarises types, location, iCloud, days and route', () => {
    const o = summarizeOverview(
      [
        item(1, 'found', { place: 'Calgary' }),
        item(2, 'found', { icloudOnly: true, latitude: null, longitude: null }),
        item(3, 'found', {
          capturedAt: '2026-08-06T18:00:00.000Z',
          mediaType: 'video',
          place: 'Banff',
        }),
      ],
      TZ,
    )
    expect(o).toMatchObject({
      days: 2,
      firstDay: '2026-08-04',
      icloudOnly: 1,
      lastDay: '2026-08-06',
      noLocation: 1,
      photos: 2,
      places: { first: 'Calgary', last: 'Banff' },
      total: 3,
      videos: 1,
    })
    expect(o.route).toHaveLength(2)
  })
  it('estimates size and time, preferring known sizes', () => {
    expect(estimateBytes([item(1, 'found', { byteSize: 1000 })])).toBe(1000)
    expect(
      estimateBytes([item(1), item(2, 'found', { mediaType: 'video' })]),
    ).toBe(4_200_000 + 22_000_000)
    expect(estimateMinutes(0)).toBe(1)
    expect(estimateMinutes(1_400_000_000)).toBe(54)
    expect(formatBytes(1_400_000_000, 'cs')).toContain('GB')
    expect(formatBytes(410_000_000, 'cs')).toBe('410 MB')
    expect(formatMinutes(55)).toBe('55 min')
    expect(formatMinutes(130)).toBe('2 h 10 min')
    expect(formatMinutes(120)).toBe('2 h')
  })
})

describe('series', () => {
  it('groups neighbours within the gap, or by burst id', () => {
    const items = [
      item(1),
      item(5),
      item(9),
      item(120),
      item(200, 'found', { burstId: 'b' }),
      item(400, 'found', { burstId: 'b' }),
    ]
    expect(
      seriesAround(items, items[1]?.id ?? '').map((i) => i.sourceId),
    ).toEqual(['a1', 'a5', 'a9'])
    expect(seriesAround(items, items[3]?.id ?? '')).toEqual([])
    expect(seriesAround(items, items[4]?.id ?? '')).toHaveLength(2)
  })
  it('scores sharpness relative to the sharpest', () => {
    const out = relativeSharpness(
      new Map([
        ['a', 100],
        ['b', 50],
      ]),
    )
    expect(out.get('a')).toBe(100)
    expect(out.get('b')).toBe(50)
    expect(relativeSharpness(new Map([['a', 0]])).get('a')).toBe(0)
  })
})

describe('isInScope', () => {
  it('keeps open items of any read, dismissed ones only of the latest read', () => {
    expect(isInScope(item(1, 'kept', { selectionId: 'old' }), 'new')).toBe(true)
    expect(isInScope(item(2, 'found', { selectionId: 'old' }), 'new')).toBe(
      true,
    )
    expect(isInScope(item(3, 'dismissed', { selectionId: 'old' }), 'new')).toBe(
      false,
    )
    expect(isInScope(item(4, 'dismissed', { selectionId: 'new' }), 'new')).toBe(
      true,
    )
    expect(isInScope(item(5, 'uploaded', { selectionId: 'new' }), 'new')).toBe(
      false,
    )
  })
})
