import { describe, expect, it } from 'vitest'
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  batchOrder,
  groupBatchByDay,
  UNKNOWN_DAY,
} from '@/features/media-batch/model/batch-days'

function media(
  id: string,
  capturedAt: string | null,
  capturedTz: string | null = 'Europe/Prague',
): MediaItem {
  return {
    altitude: null,
    caption: null,
    capturedAt,
    capturedTz,
    createdAt: '2026-01-01T00:00:00Z',
    durationMs: null,
    focalX: null,
    focalY: null,
    height: 10,
    hideLocation: false,
    id,
    journeyId: null,
    kind: 'photo',
    latitude: null,
    longitude: null,
    momentId: null,
    ownerId: 'o',
    segmentOverrideId: null,
    starred: false,
    status: 'ready',
    updatedAt: '2026-01-01T00:00:00Z',
    variants: [],
    width: 10,
  }
}

describe('groupBatchByDay', () => {
  it('groups by the local day of the capture zone, not by UTC', () => {
    // 02:30 UTC on 2 Jun is 04:30 in Prague (UTC+2): the day starts at 04:00,
    // so it is 2 Jun, while 23:30 UTC on 1 Jun (01:30 on 2 Jun) is still 1 Jun.
    const days = groupBatchByDay([
      media('a', '2026-06-01T10:00:00Z'),
      media('b', '2026-06-02T02:30:00Z'),
      media('c', '2026-06-02T08:00:00Z'),
      media('d', '2026-06-01T23:30:00Z'),
    ])
    expect(days.map((day) => [day.key, day.items.map((i) => i.id)])).toEqual([
      ['2026-06-01', ['a', 'd']],
      ['2026-06-02', ['b', 'c']],
    ])
  })

  it('uses each item capture zone', () => {
    const days = groupBatchByDay([
      media('a', '2026-06-01T23:30:00Z', 'America/Vancouver'),
    ])
    expect(days[0]?.key).toBe('2026-06-01')
    expect(days[0]?.heading).toEqual({
      iso: '2026-06-01T23:30:00Z',
      tz: 'America/Vancouver',
    })
  })

  it('sorts days ascending, items by capture time then id, and puts undated media last', () => {
    const days = groupBatchByDay([
      media('z', null),
      media('d2', '2026-06-03T09:00:00Z'),
      media('b', '2026-06-02T09:00:00Z'),
      media('a', '2026-06-02T09:00:00Z'),
      media('early', '2026-06-02T07:00:00Z'),
    ])
    expect(days.map((day) => day.key)).toEqual([
      '2026-06-02',
      '2026-06-03',
      UNKNOWN_DAY,
    ])
    expect(days[0]?.items.map((i) => i.id)).toEqual(['early', 'a', 'b'])
    expect(days[2]?.heading).toBeNull()
  })

  it('returns no days for no media and a flat reading order otherwise', () => {
    expect(groupBatchByDay([])).toEqual([])
    const days = groupBatchByDay([
      media('b', '2026-06-02T09:00:00Z'),
      media('a', '2026-06-01T09:00:00Z'),
      media('u', null),
    ])
    expect(batchOrder(days)).toEqual(['a', 'b', 'u'])
  })
})
